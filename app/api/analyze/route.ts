import { NextRequest, NextResponse } from 'next/server';
import { extractQuestions, extractAnswers, mapAndGrade, calculateGrade } from '@/lib/gemini';
import { AnalysisResult } from '@/lib/types';

// App Router segment config
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for AI processing

// Helper: convert File to base64
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    base64: buffer.toString('base64'),
    mimeType: file.type || 'image/jpeg',
  };
}

// Helper: split a PDF by converting each page to an image
// Since we can't run server-side pdfjs easily, we receive pre-converted page images from client
// The client sends each page as a separate image file
async function processFiles(
  files: File[]
): Promise<{ base64: string; mimeType: string }[]> {
  const results: { base64: string; mimeType: string }[] = [];
  for (const file of files) {
    const data = await fileToBase64(file);
    // For PDFs, Gemini can handle them directly as PDF mime type
    results.push(data);
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Get question paper files (can be multiple pages/images)
    const questionFiles = formData.getAll('questionPaper') as File[];
    // Get answer sheet files
    const answerFiles = formData.getAll('answerSheet') as File[];
    
    const language = (formData.get('language') as string) || 'auto';

    if (!questionFiles.length || !answerFiles.length) {
      return NextResponse.json(
        { error: 'Both question paper and answer sheet are required.' },
        { status: 400 }
      );
    }

    // Step 1: Extract questions
    const questionImages = await processFiles(questionFiles);
    const questions = await extractQuestions(questionImages, language);

    // Step 2: Extract answers
    const answerImages = await processFiles(answerFiles);
    const answerRegions = await extractAnswers(answerImages);

    // Step 3 & 4: Map and grade
    const { gradedItems, unmatchedAnswers } = await mapAndGrade(questions, answerRegions, language);

    // Calculate totals
    const totalMarks = gradedItems.reduce((sum, item) => sum + (item.question?.maxMarks || 5), 0);
    const marksAwarded = gradedItems.reduce((sum, item) => sum + item.marksAwarded, 0);
    const percentage = totalMarks > 0 ? Math.round((marksAwarded / totalMarks) * 100) : 0;

    // Get overall feedback from gradedItems (we pass it through via unmatchedAnswers workaround)
    // It's embedded in the mapAndGrade result - we need to extract it
    // For now generate a summary
    const answeredCount = gradedItems.filter(i => i.status === 'answered').length;
    const unansweredCount = gradedItems.filter(i => i.status === 'unanswered').length;
    const overallFeedback = `Student answered ${answeredCount} out of ${gradedItems.length} questions, scoring ${marksAwarded}/${totalMarks} marks (${percentage}%). ${unansweredCount > 0 ? `${unansweredCount} question(s) were left unanswered.` : 'All questions were attempted.'}`;

    const result: AnalysisResult = {
      gradedItems,
      unmatchedAnswers,
      totalMarks,
      marksAwarded,
      percentage,
      grade: calculateGrade(percentage),
      overallFeedback,
      answerSheetPageCount: answerFiles.length,
      questionPaperPageCount: questionFiles.length,
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Analysis error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
