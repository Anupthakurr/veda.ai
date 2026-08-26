'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './upload.module.css';

interface UploadZoneProps {
  label: string;
  icon: React.ReactNode;
  description: string;
  accept: string;
  files: File[];
  onFiles: (files: File[]) => void;
}

function UploadZone({ label, icon, description, accept, files, onFiles }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    onFiles(dropped);
  }, [onFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFiles(Array.from(e.target.files));
    }
  }, [onFiles]);

  const hasFiles = files.length > 0;

  return (
    <div
      className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''} ${hasFiles ? styles.hasFiles : ''}`}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      {hasFiles ? (
        <div className={styles.fileList}>
          <div className={styles.fileIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className={styles.fileLabel}>{label}</p>
          <div className={styles.fileNames}>
            {files.map((f, i) => (
              <span key={i} className={styles.fileName}>{f.name}</span>
            ))}
          </div>
          <p className={styles.changeHint}>Click to change files</p>
        </div>
      ) : (
        <>
          <div className={styles.zoneIcon}>{icon}</div>
          <p className={styles.zoneLabel}>{label}</p>
          <p className={styles.zoneDesc}>{description}</p>
          <span className={styles.browseBtn}>Browse Files</span>
          <p className={styles.zoneAccept}>PDF, JPG, PNG — up to 50MB</p>
        </>
      )}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [questionFiles, setQuestionFiles] = useState<File[]>([]);
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = questionFiles.length > 0 && answerFiles.length > 0 && !isProcessing;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      questionFiles.forEach(f => formData.append('questionPaper', f));
      answerFiles.forEach(f => formData.append('answerSheet', f));

      // Store file info (tiny — just name/size) in sessionStorage for the processing page
      const questionFileInfo = questionFiles.map(f => ({ name: f.name, size: f.size }));
      const answerFileInfo = answerFiles.map(f => ({ name: f.name, size: f.size }));
      sessionStorage.setItem('questionFileInfo', JSON.stringify(questionFileInfo));
      sessionStorage.setItem('answerFileInfo', JSON.stringify(answerFileInfo));

      // Store answer sheet files as Object URLs in window global (NOT sessionStorage)
      // Object URLs are just tiny pointers — no quota issues, survive client-side navigation
      const answerObjectURLs = answerFiles.map(f => URL.createObjectURL(f));
      (window as unknown as { __answerSheetURLs?: string[] }).__answerSheetURLs = answerObjectURLs;

      // Store form data in window global for the processing page to send to API
      (window as unknown as { __analysisFormData?: FormData }).__analysisFormData = formData;

      // Navigate to processing page
      router.push('/processing');

    } catch (err) {
      setIsProcessing(false);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar__inner">
          <a href="/" className="navbar__logo">
            <div className="navbar__logo-icon">V</div>
            <span className="navbar__logo-text">Veda<span>AI</span></span>
          </a>
          <span className={styles.navBadge}>Assessment Evaluator</span>
        </div>
      </nav>

      {/* Hero */}
      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.heroBadge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            AI-Powered Grading
          </div>
          <h1 className={styles.heroTitle}>
            Evaluate Answer Sheets<br />
            <span className={styles.heroAccent}>in Seconds</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Upload a question paper and student answer sheet. Our AI extracts every question,
            maps each handwritten answer, and delivers instant grading with detailed feedback.
          </p>
        </div>

        {/* Upload area */}
        <div className={styles.uploadSection}>
          <div className={styles.uploadGrid}>
            <UploadZone
              label="Question Paper"
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
              description="Upload the printed question paper"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              files={questionFiles}
              onFiles={setQuestionFiles}
            />

            <div className={styles.divider}>
              <div className={styles.dividerLine} />
              <span className={styles.dividerText}>+</span>
              <div className={styles.dividerLine} />
            </div>

            <UploadZone
              label="Student Answer Sheet"
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
              description="Upload the handwritten answer sheet"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              files={answerFiles}
              onFiles={setAnswerFiles}
            />
          </div>

          {error && (
            <div className={styles.errorBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          <div className={styles.actionRow}>
            <button
              className="btn btn-primary btn-lg"
              disabled={!canAnalyze}
              onClick={handleAnalyze}
            >
              {isProcessing ? (
                <>
                  <div className="spinner" />
                  Starting Analysis...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Analyze Assessment
                </>
              )}
            </button>
            <p className={styles.actionHint}>
              {!questionFiles.length && !answerFiles.length
                ? 'Upload both files to begin'
                : !questionFiles.length
                ? 'Upload the question paper'
                : !answerFiles.length
                ? 'Upload the answer sheet'
                : 'Ready to analyze!'}
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className={styles.features}>
          {[
            { icon: '🔍', text: 'Question Extraction' },
            { icon: '✍️', text: 'Handwriting OCR' },
            { icon: '🔗', text: 'Answer Mapping' },
            { icon: '📊', text: 'AI Grading' },
            { icon: '💡', text: 'Detailed Feedback' },
          ].map(f => (
            <div key={f.text} className={styles.featurePill}>
              <span>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
