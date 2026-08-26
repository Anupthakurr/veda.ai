import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { Question, AnswerRegion, GradedItem, UnmatchedAnswer } from './types';

// ─── Multi-key rotator ────────────────────────────────────────────────────────
// Add GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc. in .env.local for rotation
function getApiKeys(): string[] {
  const keys: string[] = [];
  // Primary key
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  // Additional keys: GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
  let i = 2;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    keys.push(process.env[`GEMINI_API_KEY_${i}`]!);
    i++;
  }
  if (keys.length === 0) throw new Error('No GEMINI_API_KEY found in environment variables.');
  return keys;
}

const API_KEYS = getApiKeys();
let currentKeyIndex = 0;

function getModel() {
  const key = API_KEYS[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// Call Gemini with automatic key rotation on rate limit errors
async function callWithRotation(
  fn: (model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>) => Promise<string>
): Promise<string> {
  const startIndex = currentKeyIndex;
  do {
    try {
      const result = await fn(getModel());
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate');
      if (isRateLimit && API_KEYS.length > 1) {
        // Rotate to next key
        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
        console.warn(`[Gemini] Rate limit hit — rotating to key ${currentKeyIndex + 1}/${API_KEYS.length}`);
        if (currentKeyIndex === startIndex) {
          // All keys exhausted
          throw new Error('All Gemini API keys have hit their rate limit. Please wait and try again.');
        }
      } else {
        throw err;
      }
    }
  } while (true);
}


// ─── Helper: convert base64 image to Gemini Part ──────────────────────────────
function imagePart(base64: string, mimeType: string): Part {
  return {
    inlineData: {
      data: base64,
      mimeType: mimeType as string,
    },
  };
}

// ─── STEP 1: Extract questions from question paper images ─────────────────────
export async function extractQuestions(
  pageImages: { base64: string; mimeType: string }[]
): Promise<Question[]> {
  const prompt = `You are an expert at analysing question papers.

Analyse the provided question paper page images and extract ALL questions in the exact printed order.

RULES:
- Treat each labelled sub-part as a SEPARATE question. E.g. "11(a)" and "11(b)" are two separate entries.
- Preserve the ORIGINAL question numbering exactly as printed.
- If marks are shown (e.g. "[5 marks]" or "(5)"), capture them as maxMarks; otherwise default to 5.
- Return ONLY a valid JSON array. No markdown, no explanation.

Output JSON format:
[
  {
    "id": "q1",
    "number": "1",
    "text": "Full question text here...",
    "maxMarks": 5,
    "pageIndex": 0
  },
  {
    "id": "q2a",
    "number": "2(a)",
    "text": "Sub-part question text...",
    "maxMarks": 3,
    "pageIndex": 0
  }
]

The "id" must be unique. Use "q" + number with letters for sub-parts (e.g. q11a, q11b).
The "pageIndex" is the 0-based index of the page image provided (0 for first image, 1 for second, etc.).`;

  const parts: Part[] = [{ text: prompt }];
  pageImages.forEach(({ base64, mimeType }, idx) => {
    parts.push({ text: `\n--- Page ${idx + 1} ---` });
    parts.push(imagePart(base64, mimeType));
  });

  const text = await callWithRotation(m => m.generateContent(parts).then(r => r.response.text().trim()));

  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(jsonText) as Question[];
}

// ─── STEP 2: Extract answer regions from answer sheet images ──────────────────
export async function extractAnswers(
  pageImages: { base64: string; mimeType: string }[]
): Promise<AnswerRegion[]> {
  const prompt = `You are an expert OCR system for handwritten student answer sheets.

Analyse each provided answer sheet page image and identify every distinct answer region.

RULES:
- Each answer written by the student is a separate region.
- For each region, provide a normalised bounding box (values between 0.0 and 1.0, relative to the full page dimensions): x (left), y (top), width, height.
- Extract the full handwritten text of each answer (OCR).
- If the student wrote a question label/number (e.g. "Ans 3", "Q.11a", "11(b)"), capture it in "questionLabel".
- Return ONLY a valid JSON array. No markdown, no explanation.

Output JSON format:
[
  {
    "id": "ar_0_0",
    "pageIndex": 0,
    "boundingBox": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.25 },
    "extractedText": "Full OCR'd answer text here...",
    "questionLabel": "1"
  }
]

The "id" format: "ar_" + pageIndex + "_" + regionIndex.
Ensure bounding boxes tightly surround the actual handwritten answer content.`;

  const allRegions: AnswerRegion[] = [];

  // Process each page individually for better accuracy
  for (let idx = 0; idx < pageImages.length; idx++) {
    const { base64, mimeType } = pageImages[idx];
    const parts: Part[] = [
      { text: prompt + `\n\nThis is PAGE ${idx + 1} (pageIndex: ${idx}). Extract all answer regions from this page only.` },
      imagePart(base64, mimeType),
    ];

    const text = await callWithRotation(m => m.generateContent(parts).then(r => r.response.text().trim()));
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    try {
      const pageRegions = JSON.parse(jsonText) as AnswerRegion[];
      // Re-index to ensure pageIndex is correct
      pageRegions.forEach((r, i) => {
        r.id = `ar_${idx}_${i}`;
        r.pageIndex = idx;
      });
      allRegions.push(...pageRegions);
    } catch {
      console.warn(`Failed to parse answer regions for page ${idx}`);
    }
  }

  return allRegions;
}

// ─── STEP 3 & 4: Map answers to questions + grade ────────────────────────────
export async function mapAndGrade(
  questions: Question[],
  answerRegions: AnswerRegion[]
): Promise<{ gradedItems: GradedItem[]; unmatchedAnswers: UnmatchedAnswer[] }> {
  const prompt = `You are an expert teacher and grader.

You have a list of QUESTIONS from a question paper and a list of ANSWER REGIONS extracted from a student's answer sheet.

Your tasks:
1. Match each answer region to the correct question (students may answer out of order).
2. For questions with no matching answer, mark them as "unanswered".
3. For answer regions that don't match any question, mark them as "unmatched".
4. Grade each answered question: award marks and provide brief feedback.
5. Provide an overall feedback summary.

QUESTIONS:
${JSON.stringify(questions, null, 2)}

ANSWER REGIONS:
${JSON.stringify(answerRegions, null, 2)}

Return ONLY a valid JSON object. No markdown, no explanation.

Output JSON format:
{
  "gradedItems": [
    {
      "questionId": "q1",
      "answerRegionIds": ["ar_0_0"],
      "status": "answered",
      "marksAwarded": 4,
      "isCorrect": true,
      "aiFeedback": "Good answer, covers the main points. Could elaborate on X."
    },
    {
      "questionId": "q2",
      "answerRegionIds": [],
      "status": "unanswered",
      "marksAwarded": 0,
      "isCorrect": false,
      "aiFeedback": "Question was not attempted."
    }
  ],
  "unmatchedAnswerIds": ["ar_1_2"],
  "overallFeedback": "The student demonstrated good understanding of most topics..."
}

Status values: "answered" | "unanswered" | "unmatched"
An answer can span multiple pages: answerRegionIds can have multiple entries.`;

  const text = await callWithRotation(m => m.generateContent(prompt).then(r => r.response.text().trim()));
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  interface MappingResult {
    gradedItems: Array<{
      questionId: string;
      answerRegionIds: string[];
      status: 'answered' | 'unanswered' | 'unmatched';
      marksAwarded: number;
      isCorrect: boolean | null;
      aiFeedback: string;
    }>;
    unmatchedAnswerIds: string[];
    overallFeedback: string;
  }

  const mapping: MappingResult = JSON.parse(jsonText);

  // Build lookup maps
  const questionMap = new Map(questions.map(q => [q.id, q]));
  const regionMap = new Map(answerRegions.map(r => [r.id, r]));

  const gradedItems: GradedItem[] = mapping.gradedItems.map(item => {
    const question = questionMap.get(item.questionId)!;
    const regions = item.answerRegionIds
      .map(id => regionMap.get(id))
      .filter(Boolean) as AnswerRegion[];

    return {
      question,
      answerRegions: regions,
      status: item.status,
      marksAwarded: item.marksAwarded,
      isCorrect: item.isCorrect,
      aiFeedback: item.aiFeedback,
    };
  });

  const unmatchedAnswers: UnmatchedAnswer[] = (mapping.unmatchedAnswerIds || [])
    .map(id => {
      const region = regionMap.get(id);
      if (!region) return null;
      return {
        answerRegion: region,
        note: 'This answer could not be matched to any question.',
      };
    })
    .filter(Boolean) as UnmatchedAnswer[];

  return { gradedItems, unmatchedAnswers };
}

// ─── Helper: Calculate grade letter ───────────────────────────────────────────
export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}
