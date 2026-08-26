// ─── Question extracted from the question paper ───────────────────────────────
export interface Question {
  id: string;            // e.g. "q1", "q11a", "q11b"
  number: string;        // e.g. "1", "11(a)", "11(b)"
  text: string;          // Full question text (or shared stem for OR questions)
  orOptions?: string[];  // Array of options if this is an OR question (e.g. ["Option A", "Option B"])
  maxMarks: number;      // Marks allocated (if detectable)
  pageIndex?: number;    // Page it appears on (0-indexed)
}

// ─── Bounding box (normalised 0–1 relative to page dimensions) ────────────────
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── A region of the answer sheet containing a handwritten answer ─────────────
export interface AnswerRegion {
  id: string;
  pageIndex: number;          // Which page of the answer sheet (0-indexed)
  boundingBox: BoundingBox;   // Normalised coords
  extractedText: string;      // OCR'd text of the handwritten content
  questionLabel?: string;     // Label the student wrote (e.g. "11a")
}

// ─── Answer status ─────────────────────────────────────────────────────────────
export type AnswerStatus = 'answered' | 'unanswered' | 'unmatched';

// ─── A single graded Q&A pair ─────────────────────────────────────────────────
export interface GradedItem {
  question: Question;
  answerRegions: AnswerRegion[];    // Can span multiple pages
  status: AnswerStatus;
  marksAwarded: number;
  isCorrect: boolean | null;        // null if unanswered
  aiFeedback: string;
  answeredOptionIndex?: number;     // For OR questions, indicates which option (0 or 1) the student answered
}

// ─── Unmatched answer (student wrote something not tied to any question) ───────
export interface UnmatchedAnswer {
  answerRegion: AnswerRegion;
  note: string;
}

// ─── Full analysis result ──────────────────────────────────────────────────────
export interface AnalysisResult {
  gradedItems: GradedItem[];
  unmatchedAnswers: UnmatchedAnswer[];
  totalMarks: number;
  marksAwarded: number;
  percentage: number;
  grade: string;
  overallFeedback: string;
  answerSheetPageCount: number;
  questionPaperPageCount: number;
}

// ─── Processing progress step ─────────────────────────────────────────────────
export type ProgressStep =
  | 'uploading'
  | 'extracting-questions'
  | 'extracting-answers'
  | 'mapping'
  | 'grading'
  | 'done'
  | 'error';

export interface ProgressState {
  step: ProgressStep;
  message: string;
  progress: number;  // 0–100
  error?: string;
}
