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
        <div className={styles.card}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerIcon}>
              {isDone ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <div className={styles.pulseRing}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
            <h1 className={styles.title}>
              {error ? 'Analysis Failed' : isDone ? 'Analysis Complete!' : 'Analysing Assessment'}
            </h1>
            <p className={styles.subtitle}>
              {error
                ? error
                : isDone
                ? 'Redirecting to results...'
                : 'Our AI is processing your files. This may take a moment.'}
            </p>
          </div>

          {/* File info */}
          <div className={styles.fileInfo}>
            <div className={styles.fileCard}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <p className={styles.fileCardLabel}>Question Paper</p>
                {questionFiles.map((f, i) => (
                  <p key={i} className={styles.fileCardName}>{f.name} <span>({formatSize(f.size)})</span></p>
                ))}
              </div>
            </div>
            <div className={styles.fileCard}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <p className={styles.fileCardLabel}>Answer Sheet</p>
                {answerFiles.map((f, i) => (
                  <p key={i} className={styles.fileCardName}>{f.name} <span>({formatSize(f.size)})</span></p>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {!error && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Steps */}
          {!error && (
            <div className={styles.steps}>
              {STEPS.map((step, idx) => {
                const isCompleted = idx < currentStep;
                const isActive = idx === currentStep && !isDone;
                return (
                  <div
                    key={step.id}
                    className={`${styles.step} ${isCompleted ? styles.stepDone : ''} ${isActive ? styles.stepActive : ''}`}
                  >
                    <div className={styles.stepIndicator}>
                      {isCompleted ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : isActive ? (
                        <div className={styles.stepSpinner} />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className={styles.stepContent}>
                      <div className={styles.stepLabelRow}>
                        <p className={styles.stepLabel}>{step.label}</p>
                        {isActive && (
                          <span className={styles.timeLeft}>
                            ~{Math.ceil(timeLeft)}s left
                          </span>
                        )}
                      </div>
                      {isActive && <p className={styles.stepDesc}>{step.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error action */}
          {error && (
            <div className={styles.errorActions}>
              <button className="btn btn-secondary" onClick={() => router.push('/')}>
                ← Back to Upload
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
