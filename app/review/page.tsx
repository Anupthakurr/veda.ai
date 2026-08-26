'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult, GradedItem, AnswerRegion } from '@/lib/types';
import styles from './review.module.css';

// ─── Score Summary Banner ──────────────────────────────────────────────────────
function ScoreSummary({ result }: { result: AnalysisResult }) {
  const answeredCount = result.gradedItems.filter(i => i.status === 'answered').length;
  const unansweredCount = result.gradedItems.filter(i => i.status === 'unanswered').length;

  return (
    <div className={styles.scoreBanner}>
      <div className={styles.scoreLeft}>
        <div className={styles.scoreCircle}>
          <svg viewBox="0 0 36 36" className={styles.scoreRing}>
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="2"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2.5"
              strokeDasharray={`${result.percentage}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.scoreCircleText}>
            <span className={styles.scoreGrade}>{result.grade}</span>
            <span className={styles.scorePct}>{result.percentage}%</span>
          </div>
        </div>
        <div>
          <p className={styles.scoreMarks}>{result.marksAwarded} / {result.totalMarks} marks</p>
          <p className={styles.scoreLabel}>Total Score</p>
        </div>
      </div>
      <div className={styles.scoreStats}>
        <div className={styles.scoreStat}>
          <span className={styles.scoreStatNum} style={{ color: 'var(--color-success)' }}>{answeredCount}</span>
          <span className={styles.scoreStatLabel}>Answered</span>
        </div>
        <div className={styles.scoreDivider} />
        <div className={styles.scoreStat}>
          <span className={styles.scoreStatNum} style={{ color: 'var(--color-error)' }}>{unansweredCount}</span>
          <span className={styles.scoreStatLabel}>Unanswered</span>
        </div>
        <div className={styles.scoreDivider} />
        <div className={styles.scoreStat}>
          <span className={styles.scoreStatNum} style={{ color: 'var(--color-warning)' }}>{result.unmatchedAnswers.length}</span>
          <span className={styles.scoreStatLabel}>Unmatched</span>
        </div>
      </div>
      <div className={styles.scoreFeedback}>
        <p className={styles.scoreFeedbackText}>{result.overallFeedback}</p>
      </div>
    </div>
  );
}

// ─── Question List Item ────────────────────────────────────────────────────────
function QuestionItem({
  item,
  isSelected,
  onClick,
}: {
  item: GradedItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusConfig = {
    answered: { label: '✓ Answered', cls: styles.badgeSuccess },
    unanswered: { label: '✗ Unanswered', cls: styles.badgeError },
    unmatched: { label: '⚠ Unmatched', cls: styles.badgeWarning },
  };
  const s = statusConfig[item.status];

  return (
    <div
      className={`${styles.questionItem} ${isSelected ? styles.questionItemSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.questionHeader}>
        <div className={styles.questionNum}>{item.question?.number ?? '?'}</div>
        <div className={styles.questionMeta}>
          <span className={`${styles.badge} ${s.cls}`}>{s.label}</span>
          {item.status === 'answered' && (
            <span className={styles.scoreChip}>{item.marksAwarded}/{item.question?.maxMarks ?? 5}</span>
          )}
        </div>
      </div>
      <p className={styles.questionText}>{item.question?.text}</p>
      {isSelected && item.aiFeedback && (
        <div className={styles.feedbackInline}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 9a1 1 0 00-1 1v4a1 1 0 102 0v-4a1 1 0 00-1-1zm0-4a1 1 0 100 2 1 1 0 000-2z"/>
          </svg>
          {item.aiFeedback}
        </div>
      )}
    </div>
  );
}

// ─── Answer Viewer with Canvas Highlight ──────────────────────────────────────
function AnswerViewer({
  images,
  highlightRegions,
  totalPages,
}: {
  images: string[];
  highlightRegions: AnswerRegion[];
  totalPages: number;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const drawHighlights = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imgRef.current;
    if (!img) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageRegions = highlightRegions.filter(r => r.pageIndex === currentPage);

    pageRegions.forEach(region => {
      const { x, y, width, height } = region.boundingBox;
      const px = x * canvas.width;
      const py = y * canvas.height;
      const pw = width * canvas.width;
      const ph = height * canvas.height;

      // Highlight fill
      ctx.fillStyle = 'rgba(240, 90, 40, 0.18)';
      ctx.fillRect(px, py, pw, ph);

      // Border
      ctx.strokeStyle = 'rgba(240, 90, 40, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, pw, ph);

      // Top-left corner label
      ctx.fillStyle = 'rgba(240, 90, 40, 0.95)';
      ctx.fillRect(px, py - 22, 60, 22);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText(region.questionLabel ? `Q ${region.questionLabel}` : 'Answer', px + 6, py - 6);
    });
  }, [highlightRegions, currentPage]);

  useEffect(() => {
    drawHighlights();
  }, [drawHighlights]);

  const currentImageSrc = images[currentPage] ?? null;
  const hasHighlightsOnPage = highlightRegions.some(r => r.pageIndex === currentPage);

  return (
    <div className={styles.viewer}>
      {/* Page navigation */}
      {totalPages > 1 && (
        <div className={styles.pageNav}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            ← Prev
          </button>
          <span className={styles.pageLabel}>Page {currentPage + 1} of {totalPages}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            Next →
          </button>
        </div>
      )}

      {/* Image + canvas overlay */}
      <div className={styles.imageContainer}>
        {currentImageSrc ? (
          <div className={styles.imageWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImageSrc}
              alt={`Answer sheet page ${currentPage + 1}`}
              className={styles.answerImage}
              ref={el => {
                imgRef.current = el;
                if (el) {
                  el.onload = drawHighlights;
                }
              }}
            />
            {hasHighlightsOnPage && (
              <canvas
                ref={canvasRef}
                className={styles.highlightCanvas}
              />
            )}
          </div>
        ) : (
          <div className={styles.noImage}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>No image available for this page</p>
          </div>
        )}
      </div>

      {highlightRegions.length === 0 && (
        <div className={styles.viewerHint}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Select a question from the left panel to highlight its answer region
        </div>
      )}
    </div>
  );
}

// ─── Main Review Page ──────────────────────────────────────────────────────────
export default function ReviewPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<GradedItem | null>(null);
  const [activeTab, setActiveTab] = useState<'questions' | 'unmatched'>('questions');
  const [filterStatus, setFilterStatus] = useState<'all' | 'answered' | 'unanswered'>('all');

  useEffect(() => {
    const stored = sessionStorage.getItem('analysisResult');

    if (!stored) {
      router.push('/');
      return;
    }

    setResult(JSON.parse(stored));

    // Read answer sheet Object URLs from window global (set by upload page)
    const urls = (window as unknown as { __answerSheetURLs?: string[] }).__answerSheetURLs;
    if (urls && urls.length > 0) {
      setAnswerImages(urls);
    }
  }, [router]);

  if (!result) {
    return (
      <div className={styles.loading}>
        <div className="spinner spinner-primary" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p>Loading results...</p>
      </div>
    );
  }

  const filteredItems = result.gradedItems.filter(item => {
    if (filterStatus === 'all') return true;
    return item.status === filterStatus;
  });

  const highlightRegions = selectedItem ? selectedItem.answerRegions : [];

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar__inner">
          <a href="/" className="navbar__logo">
            <div className="navbar__logo-icon">V</div>
            <span className="navbar__logo-text">Veda<span>AI</span></span>
          </a>
          <div className={styles.navActions}>
            <button className="btn btn-secondary btn-sm" onClick={() => router.push('/')}>
              ← New Assessment
            </button>
          </div>
        </div>
      </nav>

      {/* Score Banner */}
      <ScoreSummary result={result} />

      {/* Three-column layout */}
      <div className={styles.layout}>
        {/* Left: Question List */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTabs}>
              <button
                className={`${styles.tab} ${activeTab === 'questions' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('questions')}
              >
                Questions ({result.gradedItems.length})
              </button>
              {result.unmatchedAnswers.length > 0 && (
                <button
                  className={`${styles.tab} ${activeTab === 'unmatched' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('unmatched')}
                >
                  Unmatched ({result.unmatchedAnswers.length})
                </button>
              )}
            </div>

            {activeTab === 'questions' && (
              <div className={styles.filterRow}>
                {(['all', 'answered', 'unanswered'] as const).map(f => (
                  <button
                    key={f}
                    className={`${styles.filterBtn} ${filterStatus === f ? styles.filterBtnActive : ''}`}
                    onClick={() => setFilterStatus(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.questionList}>
            {activeTab === 'questions' && filteredItems.map(item => (
              <QuestionItem
                key={item.question?.id}
                item={item}
                isSelected={selectedItem?.question?.id === item.question?.id}
                onClick={() => {
                  setSelectedItem(prev => prev?.question?.id === item.question?.id ? null : item);
                }}
              />
            ))}

            {activeTab === 'unmatched' && result.unmatchedAnswers.map((ua, idx) => (
              <div key={idx} className={styles.unmatchedItem}>
                <div className={`${styles.badge} ${styles.badgeWarning}`}>⚠ Unmatched Answer</div>
                <p className={styles.unmatchedText}>&quot;{ua.answerRegion.extractedText}&quot;</p>
                <p className={styles.unmatchedNote}>{ua.note}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: Answer Viewer */}
        <main className={styles.centerPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              {selectedItem
                ? `Answer Sheet — Q${selectedItem.question?.number}`
                : 'Answer Sheet Viewer'}
            </h2>
            {selectedItem && (
              <button className={`${styles.tab} ${styles.tabActive}`} onClick={() => setSelectedItem(null)}>
                Clear Selection ✕
              </button>
            )}
          </div>
          <AnswerViewer
            images={answerImages}
            highlightRegions={highlightRegions}
            totalPages={result.answerSheetPageCount}
          />
        </main>

        {/* Right: Feedback Panel */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>AI Feedback</h2>
          </div>

          {selectedItem ? (
            <div className={styles.feedbackPanel}>
              <div className={styles.feedbackQuestion}>
                <span className={styles.feedbackQNum}>Q{selectedItem.question?.number}</span>
                <p className={styles.feedbackQText}>{selectedItem.question?.text}</p>
              </div>

              <div className={styles.feedbackScore}>
                <div>
                  <p className={styles.feedbackScoreNum}>{selectedItem.marksAwarded}</p>
                  <p className={styles.feedbackScoreLabel}>of {selectedItem.question?.maxMarks ?? 5} marks</p>
                </div>
                <div className={styles.feedbackStatus}>
                  {selectedItem.status === 'answered' ? (
                    <span className={`${styles.badge} ${styles.badgeSuccess}`}>✓ Answered</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeError}`}>✗ Unanswered</span>
                  )}
                </div>
              </div>

              {selectedItem.answerRegions.length > 0 && (
                <div className={styles.feedbackAnswerText}>
                  <p className={styles.feedbackAnswerLabel}>Extracted Answer</p>
                  <p className={styles.feedbackAnswerContent}>
                    {selectedItem.answerRegions.map(r => r.extractedText).join(' ')}
                  </p>
                </div>
              )}

              <div className={styles.feedbackAI}>
                <p className={styles.feedbackAILabel}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  AI Feedback
                </p>
                <p className={styles.feedbackAIText}>{selectedItem.aiFeedback}</p>
              </div>
            </div>
          ) : (
            <div className={styles.feedbackEmpty}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>Click a question to see detailed AI feedback</p>
            </div>
          )}

          {/* Overall feedback at bottom */}
          <div className={styles.overallFeedback}>
            <p className={styles.overallFeedbackLabel}>Overall Assessment</p>
            <p className={styles.overallFeedbackText}>{result.overallFeedback}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
