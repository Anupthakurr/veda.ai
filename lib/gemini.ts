import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { Question, AnswerRegion, GradedItem, UnmatchedAnswer } from './types';

// ─── Multi-key rotator + Rate Limiter ─────────────────────────────────────────
// Gemini 2.5 Flash FREE tier actual limits:
//   - 5 RPM  (requests per minute) per key
//   - 20 RPD (requests per day)    per key
// Strategy:
//   - No proactive throttle needed — sequential calls naturally take 15-20s each,
//     which keeps us well under 5 RPM without adding extra delays.
//   - On 429: exponential backoff (2s → 4s → 8s) then rotate to next key
//   - Track daily usage and warn/block at 20 RPD per key

function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
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

// Per-key daily request counter (resets at midnight UTC)
const dailyUsage: Record<number, { count: number; date: string }> = {};
const RPD_LIMIT = 20;
const RPD_WARN_AT = 16; // warn at 80% of daily limit


// Fast model — thinking DISABLED (extraction calls don't need deep reasoning)
// Disabling thinking saves 15-30s per call
function getModel() {
  const key = API_KEYS[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    systemInstruction: "CRITICAL: Never recite or copy large blocks of text verbatim from the prompt. Always heavily paraphrase to avoid copyright RECITATION filters.",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseMimeType: 'application/json' } as any,
  });
}

// Grading model — minimal thinking budget (enough for accurate scoring, not slow)
function getGradingModel() {
  const key = API_KEYS[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    systemInstruction: "CRITICAL: Never recite or copy large blocks of text verbatim from the prompt. Always heavily paraphrase to avoid copyright RECITATION filters.",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseMimeType: 'application/json' } as any,
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── JSON Parser Helper ───────────────────────────────────────────────────────
// Fixes common JSON formatting errors made by AI (like unescaped LaTeX backslashes or raw control chars)
function parseAIJson<T>(text: string): T {
  let clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.warn('[VedaAI] JSON parse failed on first attempt. Attempting sanitization...');
    // 1. Replace unescaped backslashes for LaTeX (e.g., \frac -> \\frac)
    // Matches \ not preceded by \ and not followed by valid JSON escape chars (\, ", /, n, r, t, b, f, u)
    clean = clean.replace(/(?<!\\)\\(?![\\"/nrtbfu])/g, '\\\\');
    
    // 2. Remove illegal control characters strictly inside the string (0x00 to 0x1F) except structural newlines/tabs
    // It's safer to strip bad control chars entirely rather than replacing structural \n.
    // JSON.parse fails on raw tabs or newlines *inside string values*.
    // We'll strip raw control characters that aren't structural newlines (\n) or carriage returns (\r).
    clean = clean.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]+/g, '');

    try {
      return JSON.parse(clean);
    } catch (err) {
      console.error('[VedaAI] FATAL JSON Parse Error. Cleaned text:', clean);
      throw err;
    }
  }
}

// Tracks daily usage per key — blocks at 20 RPD limit
function trackUsage(): void {
  const todayUTC = new Date().toISOString().slice(0, 10);

  if (!dailyUsage[currentKeyIndex] || dailyUsage[currentKeyIndex].date !== todayUTC) {
    dailyUsage[currentKeyIndex] = { count: 0, date: todayUTC };
  }

  const usage = dailyUsage[currentKeyIndex];

  if (usage.count >= RPD_LIMIT) {
    throw new Error(`429: Key ${currentKeyIndex + 1} has reached its daily limit of ${RPD_LIMIT} requests.`);
  }
  if (usage.count >= RPD_WARN_AT) {
    console.warn(`[Gemini] Key ${currentKeyIndex + 1}: ${usage.count}/${RPD_LIMIT} daily requests — approaching limit!`);
  }

  usage.count++;
  console.log(`[Gemini] Key ${currentKeyIndex + 1}: request ${usage.count}/${RPD_LIMIT} today`);
}

// Full strategy: daily tracking + reactive backoff on 429 + key rotation
async function callWithRotation(
  fn: (model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>) => Promise<string>,
  modelSelector: () => ReturnType<GoogleGenerativeAI['getGenerativeModel']> = getModel
): Promise<string> {
  const MAX_RETRIES_PER_KEY = 3;
  const startKeyIndex = currentKeyIndex;
  let keyRotations = 0;
  let lastErrorMsg = '';

  while (keyRotations <= API_KEYS.length) {
    let retryCount = 0;

    while (retryCount < MAX_RETRIES_PER_KEY) {
      try {
        trackUsage(); // Check/increment daily counter
        const result = await fn(modelSelector());
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        lastErrorMsg = message;
        const isRetryable =
          message.includes('429') ||
          message.includes('503') ||
          message.includes('500') ||
          message.toLowerCase().includes('quota') ||
          message.toLowerCase().includes('rate limit') ||
          message.toLowerCase().includes('overloaded') ||
          message.toLowerCase().includes('fetch failed');

        if (isRetryable) {
          retryCount++;
          if (retryCount < MAX_RETRIES_PER_KEY) {
            // Exponential backoff: 2s, 4s, 8s
            const backoff = Math.pow(2, retryCount) * 1000;
            console.warn(`[Gemini] API error on key ${currentKeyIndex + 1} (${message.substring(0, 80)}...) — backoff ${backoff}ms (retry ${retryCount}/${MAX_RETRIES_PER_KEY})`);
            await sleep(backoff);
          }
        } else {
          throw err;
        }
      }
    }

    // Key exhausted — rotate to next
    if (API_KEYS.length > 1) {
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      keyRotations++;
      console.warn(`[Gemini] Rotating to key ${currentKeyIndex + 1}/${API_KEYS.length}`);
      if (currentKeyIndex === startKeyIndex) break;
    } else {
      break;
    }
  }

  throw new Error(
    `All ${API_KEYS.length} Gemini API key(s) failed. Last API Error: ${lastErrorMsg}`
  );
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
  pageImages: { base64: string; mimeType: string }[],
  language: string = 'auto'
): Promise<Question[]> {
  let langInstruction = '';
  if (language === 'english') langInstruction = 'CRITICAL LANGUAGE RULE: You MUST extract the questions in ENGLISH. If the paper is written in another language (e.g. Hindi), TRANSLATE the questions into English.';
  else if (language === 'hindi') langInstruction = 'CRITICAL LANGUAGE RULE: You MUST extract the questions in HINDI. If the paper is written in another language (e.g. English), TRANSLATE the questions into Hindi.';
  else langInstruction = 'Extract the questions in the language they are written.';

  const prompt = `You are an expert at analysing question papers.
${langInstruction}

Analyse the provided question paper page images and extract ALL questions in the exact printed order.

RULES:
- CRITICAL SAFETY RULE: To avoid AI recitation filters on standard exam papers, DO NOT extract the questions completely verbatim. You MUST slightly paraphrase the non-mathematical text of each question, while preserving the exact mathematical equations, numbers, and core meaning. If you encounter a famous poem, passage, or copyrighted text, heavily summarize it instead of copying it.
- EXTRACT EVERY SINGLE QUESTION. Do not skip, omit, or summarize any questions. You must comprehensively capture the entire paper.
- IGNORE general instructions (e.g., "Attempt all questions", "Section A", "Time: 3 hours"). Only extract actual questions that require an answer.
- NORMAL SUB-PARTS: If a question has labelled sub-parts (e.g., (a), (b), (c)) with NO "OR" between them, extract each sub-part as a SEPARATE question (e.g., 3 separate JSON entries).
- CRITICAL RULE FOR "OR" CHOICES: If sub-parts or whole questions are separated by "OR" / "अथवा" (e.g., "21(a) ... OR (b) ..."), YOU MUST MERGE BOTH OPTIONS into a SINGLE question entry in the JSON. NEVER split an "OR" choice into multiple JSON objects.
- Preserve the ORIGINAL question numbering exactly as printed.
- INFER THE MARKING SCHEME accurately. Read the instructions at the top (e.g., "Q1-5 carry 1 mark") AND look for marks printed next to questions (e.g., "[5]"). Assign the correct maxMarks to EACH question based on the official scheme. If completely unknown, default to 5.
- CRITICAL MATH RULE: All mathematical symbols, variables, or equations MUST be enclosed in standard LaTeX delimiters: '$' for inline math (e.g., $\\vec{a}$) and '$$' for block math. Do not output naked LaTeX commands like \\vec{a}.
- CRITICAL JSON RULE: Double-escape all LaTeX backslashes (e.g., \\\\sqrt) and do NOT use unescaped newlines inside string values.
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
  return parseAIJson<Question[]>(text);
}

// ─── STEP 2: Extract answer regions from ALL answer sheet pages in ONE call ────
export async function extractAnswers(
  pageImages: { base64: string; mimeType: string }[]
): Promise<AnswerRegion[]> {
  const BATCH_SIZE = 5;
  const allRegions: AnswerRegion[] = [];

  console.log(`[VedaAI] Extracting answers from ${pageImages.length} pages in batches of ${BATCH_SIZE}`);

  for (let i = 0; i < pageImages.length; i += BATCH_SIZE) {
    const batchImages = pageImages.slice(i, i + BATCH_SIZE);
    
    const prompt = `You are an expert OCR system for handwritten student answer sheets.

Analyse ALL provided answer sheet page images and identify every distinct answer region across all pages.

RULES:
- Each answer written by the student is a separate region.
- Identify the bounding box of the answer region relative to the specific page image. Coordinates (x, y, width, height) should be normalized between 0.0 and 1.0.
- Extract the handwritten text of each answer. CRITICAL SAFETY RULE: To avoid AI recitation filters, DO NOT extract the text completely verbatim. You MUST slightly paraphrase the non-mathematical text of each answer, while preserving the exact mathematical equations, numbers, and core meaning.
- If the student explicitly wrote a question number (e.g., "Ans 1", "Q. 5(a)"), capture it as "questionLabel". Otherwise, leave it null.
- pageIndex is 0-based (first page = 0, second = 1, etc.)
- CRITICAL MATH RULE: All mathematical symbols, variables, or equations MUST be enclosed in standard LaTeX delimiters: '$' for inline math (e.g., $\\vec{a}$) and '$$' for block math. Do not output naked LaTeX commands like \\vec{a}.
- CRITICAL JSON RULE: Double-escape all LaTeX backslashes (e.g., \\\\sqrt) and do NOT use unescaped newlines inside string values.
- Return ONLY a valid JSON array. No markdown, no explanation.

Output JSON format:
[
  {
    "id": "ar_0_0",
    "pageIndex": 0,
    "boundingBox": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.25 },
    "extractedText": "Full OCR answer text...",
    "questionLabel": "1"
  }
]

The "id" format: "ar_" + pageIndex + "_" + regionIndex within that page.`;

    const parts: Part[] = [{ text: prompt }];
    batchImages.forEach(({ base64, mimeType }, idx) => {
      const globalIdx = i + idx;
      parts.push({ text: `\n--- PAGE ${globalIdx + 1} (pageIndex: ${globalIdx}) ---` });
      parts.push(imagePart(base64, mimeType));
    });

    console.log(`[VedaAI] Processing batch: pages ${i + 1} to ${i + batchImages.length}`);
    const text = await callWithRotation(m => m.generateContent(parts).then(r => r.response.text().trim()));

    try {
      const regions = parseAIJson<AnswerRegion[]>(text);
      // Ensure ids are set correctly
      regions.forEach((r, idx) => {
        if (!r.id) r.id = `ar_${r.pageIndex ?? 0}_${idx}`;
      });
      allRegions.push(...regions);
    } catch {
      console.warn(`[VedaAI] Failed to parse answer regions for batch ${i + 1} — skipping this batch`);
    }
  }

  console.log(`[VedaAI] Extracted total ${allRegions.length} answer regions across ${pageImages.length} pages`);
  return allRegions;
}

// ─── STEP 3 & 4: Map answers to questions + grade ────────────────────────────
export async function mapAndGrade(
  questions: Question[],
  answerRegions: AnswerRegion[],
  language: string = 'auto'
): Promise<{ gradedItems: GradedItem[]; unmatchedAnswers: UnmatchedAnswer[] }> {
  let langInstruction = '';
  if (language === 'english') langInstruction = 'CRITICAL LANGUAGE RULE: You MUST write all your feedback (aiFeedback and overallFeedback) strictly in ENGLISH. Do not use Hindi.';
  else if (language === 'hindi') langInstruction = 'CRITICAL LANGUAGE RULE: You MUST write all your feedback (aiFeedback and overallFeedback) strictly in HINDI. Do not use English.';
  else langInstruction = 'Write your feedback in the same language that the question paper and student answers are written in.';

  const BATCH_SIZE = 15;
  const allGradedInfos = new Map<string, any>();
  const overallFeedbacks: string[] = [];

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const questionBatch = questions.slice(i, i + BATCH_SIZE);

    const prompt = `You are an expert teacher and grader.
${langInstruction}

You will be given:
1. A list of officially extracted questions from a question paper (this is a batch of ${questionBatch.length} questions), including their max marks.
2. A list of ALL extracted handwritten answer regions from a student's answer sheet.

TASKS:
1. For EVERY SINGLE QUESTION in the provided QUESTIONS list, attempt to find its corresponding handwritten answer in the ANSWER REGIONS list. Pay close attention to question numbers written by the student (e.g., "Ans 1", "Q. 5(a)").
2. If a question was not answered by the student, mark it as unanswered.
3. Grade each answered question: award marks STRICTLY based on the maxMarks provided in the QUESTION object. CRITICAL: Do NOT exceed maxMarks. Award partial marks for partially correct answers. Provide brief feedback.
4. Provide a brief overall feedback summary for this batch.

CRITICAL REQUIREMENT: Your output JSON array MUST contain EXACTLY ${questionBatch.length} items in the gradedItems array. You MUST evaluate every single question in this batch.
CRITICAL GRADING RULE: The marksAwarded MUST NOT exceed the maxMarks for the question. If maxMarks is 1, the maximum you can award is 1.

CRITICAL SAFETY RULE: To avoid AI recitation filters, DO NOT quote the questions or answers verbatim in your feedback. Always paraphrase or summarize when referring to them.
CRITICAL MATH RULE: All mathematical symbols, variables, or equations in your feedback MUST be enclosed in standard LaTeX delimiters: '$' for inline math (e.g., $\\vec{a}$) and '$$' for block math.
CRITICAL JSON RULE: Double-escape all LaTeX backslashes (e.g., \\\\sqrt) and do NOT use unescaped newlines inside string values (use \\n instead).

QUESTIONS BATCH:
${JSON.stringify(questionBatch, null, 2)}

ALL ANSWER REGIONS:
${JSON.stringify(answerRegions, null, 2)}

Return ONLY a valid JSON object in this format:
{
  "gradedItems": [
    {
      "questionId": "q1",
      "answerRegionIds": ["ar_0_0"],
      "status": "answered",
      "marksAwarded": 1,
      "isCorrect": true,
      "aiFeedback": "Good answer, covers the main points."
    }
  ],
  "overallFeedback": "The student demonstrated good understanding of this section."
}

Status values: "answered" | "unanswered"
An answer can span multiple pages: answerRegionIds can have multiple entries.`;

    const text = await callWithRotation(
      m => m.generateContent(prompt).then(r => r.response.text().trim()),
      getGradingModel
    );

    try {
      const mapping = parseAIJson<any>(text);
      if (mapping.gradedItems && Array.isArray(mapping.gradedItems)) {
        for (const item of mapping.gradedItems) {
          allGradedInfos.set(item.questionId, item);
        }
      }
      if (mapping.overallFeedback) {
        overallFeedbacks.push(mapping.overallFeedback);
      }
    } catch (e) {
      console.warn(`[VedaAI] Failed to parse grading batch ${i + 1}`);
    }
  }

  const regionMap = new Map(answerRegions.map(r => [r.id, r]));
  const usedRegionIds = new Set<string>();

  const gradedItems: GradedItem[] = questions.map(question => {
    const gradedInfo = allGradedInfos.get(question.id);
    
    if (gradedInfo) {
      const regions = (gradedInfo.answerRegionIds || [])
        .map((id: string) => regionMap.get(id))
        .filter(Boolean) as AnswerRegion[];
        
      regions.forEach(r => usedRegionIds.add(r.id));

      // Enforce max marks
      let marks = Number(gradedInfo.marksAwarded) || 0;
      if (marks > (question.maxMarks || 5)) {
        marks = question.maxMarks || 5;
      }

      return {
        question,
        answerRegions: regions,
        status: gradedInfo.status === 'answered' && regions.length > 0 ? 'answered' : 'unanswered',
        marksAwarded: marks,
        isCorrect: gradedInfo.isCorrect,
        aiFeedback: gradedInfo.aiFeedback || '',
      };
    } else {
      return {
        question,
        answerRegions: [],
        status: 'unanswered',
        marksAwarded: 0,
        isCorrect: false,
        aiFeedback: 'Question was not attempted or was missed by the grader.',
      };
    }
  });

  const unmatchedAnswers: UnmatchedAnswer[] = answerRegions
    .filter(r => !usedRegionIds.has(r.id))
    .map(region => ({
      answerRegion: region,
      note: 'This answer could not be matched to any question.',
    }));

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
