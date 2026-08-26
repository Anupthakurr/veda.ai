'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './processing.module.css';

interface Step {
  id: string;
  label: string;
  description: string;
  durationMs: number;
}

const STEPS: Step[] = [
  { id: 'extracting-questions', label: 'Extracting Questions', description: 'Reading question paper and identifying all questions...', durationMs: 5000 },
  { id: 'extracting-answers', label: 'Extracting Answers', description: 'Analysing handwritten answer sheet with OCR...', durationMs: 15000 },
  { id: 'mapping', label: 'Mapping Answers', description: 'Matching each answer to its corresponding question...', durationMs: 2000 },
  { id: 'grading', label: 'AI Grading & Feedback', description: 'Evaluating answers... This step takes the longest (approx 60-90s) as the AI evaluates 50+ answers in detail. Intermittent API retries are handled automatically.', durationMs: 90000 },
];

export default function ProcessingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(STEPS[0].durationMs / 1000);
  const [error, setError] = useState<string | null>(null);
  const [questionFiles, setQuestionFiles] = useState<{ name: string; size: number }[]>([]);
  const [answerFiles, setAnswerFiles] = useState<{ name: string; size: number }[]>([]);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;

    const qInfo = sessionStorage.getItem('questionFileInfo');
    const aInfo = sessionStorage.getItem('answerFileInfo');
    if (qInfo) setQuestionFiles(JSON.parse(qInfo));
    if (aInfo) setAnswerFiles(JSON.parse(aInfo));

    // Get form data from global
    const formData = (window as unknown as { __analysisFormData?: FormData }).__analysisFormData;
    if (!formData) {
      router.push('/');
      return;
    }

    runAnalysis(formData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = async (formData: FormData) => {
    let stepIdx = 0;
    let currentStepTimeRemaining = STEPS[0].durationMs / 1000;

    // Timer for counting down the seconds
    const countdownInterval = setInterval(() => {
      currentStepTimeRemaining = Math.max(0, currentStepTimeRemaining - 1);
      setTimeLeft(currentStepTimeRemaining);
    }, 1000);

    // Timer for progressing through steps
    const scheduleNextStep = () => {
      if (stepIdx >= STEPS.length - 1) return; // Wait at the last step (Grading) until API finishes
      setTimeout(() => {
        stepIdx++;
        setCurrentStep(stepIdx);
        setProgress((stepIdx / STEPS.length) * 85);
        currentStepTimeRemaining = STEPS[stepIdx].durationMs / 1000;
        setTimeLeft(currentStepTimeRemaining);
        scheduleNextStep();
      }, STEPS[stepIdx].durationMs);
    };

    scheduleNextStep();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      clearInterval(countdownInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const result = await response.json();

      // Store result in sessionStorage for the review page
      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      setCurrentStep(STEPS.length);
      setProgress(100);

      // Navigate after brief delay
      setTimeout(() => {
        router.push('/review');
      }, 1000);

    } catch (err) {
      clearInterval(countdownInterval);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isDone = currentStep >= STEPS.length;

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar__inner">
          <a href="/" className="navbar__logo">
            <div className="navbar__logo-icon">V</div>
            <span className="navbar__logo-text">Veda<span>AI</span></span>
          </a>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.minimalContainer}>
          {error ? (
            <>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 24 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <h1 className={styles.minimalTitle}>Analysis Failed</h1>
              <p className={styles.minimalSubtitle}>{error}</p>
              <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => router.push('/')}>
                ← Back to Upload
              </button>
            </>
          ) : isDone ? (
            <>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 24 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <h1 className={styles.minimalTitle}>Analysis Complete!</h1>
              <p className={styles.minimalSubtitle}>Redirecting to results...</p>
            </>
          ) : (
            <>
              <div className={styles.sparkles}>
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Center Large Star */}
                  <path d="M55 20 C55 38 68 51 86 51 C68 51 55 64 55 82 C55 64 42 51 24 51 C42 51 55 38 55 20Z" fill="#FF5A36"/>
                  {/* Bottom Left Medium Star */}
                  <path d="M30 65 C30 75 37 82 47 82 C37 82 30 89 30 99 C30 89 23 82 13 82 C23 82 30 75 30 65Z" fill="#FF5A36"/>
                  {/* Top Left Small Star */}
                  <path d="M25 30 C25 35 28 38 33 38 C28 38 25 41 25 46 C25 41 22 38 17 38 C22 38 25 35 25 30Z" fill="#FF5A36"/>
                  {/* Bottom Right Small Star */}
                  <path d="M70 70 C70 75 73 78 78 78 C73 78 70 81 70 86 C70 81 67 78 62 78 C67 78 70 75 70 70Z" fill="#FF5A36"/>
                </svg>
              </div>
              <h1 className={styles.minimalTitle}>Extracting...</h1>
              <p className={styles.minimalSubtitle}>This may take a while</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
