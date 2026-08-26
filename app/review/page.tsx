'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult, GradedItem, AnswerRegion } from '@/lib/types';
import styles from './review.module.css';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

// ─── Question List Item (Accordion) ────────────────────────────────────────────
function QuestionItem({
  item,
  isExpanded,
  onToggle,
}: {
  item: GradedItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const maxMarks = item.question?.maxMarks ?? 5;
  const marks = item.marksAwarded;
  
  let scoreColorCls = styles.scoreRed;
  if (marks === maxMarks) scoreColorCls = styles.scoreGreen;
  else if (marks > 0) scoreColorCls = styles.scoreOrange;

  const rawNum = item.question?.number ?? '?';
  const match = rawNum.match(/^(\D*\d+)\s*(.*)$/);
  const mainNum = match ? match[1] : rawNum;
  const subNum = match ? match[2] : '';

  return (
    <div
      className={`${styles.questionItem} ${isExpanded ? styles.questionItemExpanded : ''}`}
      onClick={onToggle}
    >
      <div className={styles.questionHeader}>
        <div className={styles.questionNumWrapper}>
          <div className={styles.questionBadgeGroup}>
            <div className={styles.questionNumBadge}>{mainNum}</div>
            {subNum && <div className={styles.questionSubNum}>{subNum}</div>}
          </div>
          <div className={styles.questionText}>
            {item.question?.text && (
              <div className={styles.questionStem}>
                <Latex>{item.question.text.replace(/\\n|\n/g, ' ')}</Latex>
              </div>
            )}
            
            {item.question?.orOptions && item.question.orOptions.length > 0 && (
              <div className={styles.orOptionsContainer}>
                {item.question.orOptions.map((opt, idx) => {
                  const isMapped = item.answeredOptionIndex === idx;
                  const hasMapped = item.answeredOptionIndex !== undefined;
                  const optionClass = isMapped 
                    ? styles.orOptionMapped 
                    : (hasMapped ? styles.orOptionUnmapped : '');
                  
                  return (
                    <div key={idx}>
                      {idx > 0 && (
                        <div className={styles.orDivider}>
                          <span>OR</span>
                        </div>
                      )}
                      <div className={`${styles.orOption} ${optionClass}`}>
                        {isMapped && <div className={styles.mappedBadge}>Answered</div>}
                        <Latex>{opt.replace(/\\n|\n/g, ' ')}</Latex>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className={styles.questionRight}>
          <span className={`${styles.scorePill} ${scoreColorCls}`}>
            {marks}/{maxMarks}
          </span>
          <div className={styles.chevron}>
            {isExpanded ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && item.aiFeedback && (
        <div className={styles.feedbackContainer}>
          <p className={styles.feedbackLabel}>AI Feedback</p>
          <div className={styles.feedbackText}>
            <Latex>{item.aiFeedback}</Latex>
          </div>
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-jump to the correct page when a question is selected
  useEffect(() => {
    if (highlightRegions.length > 0 && highlightRegions[0].pageIndex !== undefined) {
      const targetPage = highlightRegions[0].pageIndex;
      if (targetPage >= 0 && targetPage < totalPages) {
        setCurrentPage(targetPage);
        
        // Auto-scroll to the top of the first bounding box (retry until image is loaded)
        const scrollToHighlight = () => {
          if (scrollContainerRef.current && imgRef.current && imgRef.current.complete && imgRef.current.naturalHeight > 0) {
            const firstRegion = highlightRegions[0];
            const yOffset = firstRegion.boundingBox.y * imgRef.current.clientHeight;
            scrollContainerRef.current.scrollTo({
              top: Math.max(0, yOffset - 50),
              behavior: 'smooth'
            });
          } else {
            setTimeout(scrollToHighlight, 50);
          }
        };
        setTimeout(scrollToHighlight, 10);
      }
    }
  }, [highlightRegions, totalPages]);

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

      // Green Highlight fill
      ctx.fillStyle = 'rgba(74, 222, 128, 0.15)'; // Light green tint
      ctx.fillRect(px, py, pw, ph);

      // Solid Green Border
      ctx.strokeStyle = '#4ADE80'; // Green-400
      ctx.lineWidth = 4;
      ctx.strokeRect(px, py, pw, ph);

      // Top-left corner label (Q2 etc)
      const labelText = region.questionLabel ? `Q${region.questionLabel}` : 'Ans';
      ctx.fillStyle = '#4ADE80';
      ctx.beginPath();
      // Draw rounded tab
      ctx.roundRect(px, py - 28, 48, 28, [8, 8, 0, 0]);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.fillText(labelText, px + 10, py - 8);
    });
  }, [highlightRegions, currentPage]);

  useEffect(() => {
    drawHighlights();
  }, [drawHighlights]);

  const currentImageSrc = images[currentPage] ?? null;
  const hasHighlightsOnPage = highlightRegions.some(r => r.pageIndex === currentPage);

  return (
    <div className={styles.viewer}>
      {/* Dark Header Strip */}
      <div className={styles.viewerHeader}>
        <span className={styles.viewerTitle}>Answer Sheet</span>
        <div className={styles.viewerControls}>
          <div className={styles.zoomControl}>
            <button className={styles.iconBtn}>-</button>
            <span className={styles.zoomText}>100%</span>
            <button className={styles.iconBtn}>+</button>
          </div>
          {totalPages > 1 && (
            <div className={styles.pageControl}>
              <button
                className={styles.iconBtn}
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                {'<'}
              </button>
              <span className={styles.pageText}>Page {currentPage + 1} of {totalPages}</span>
              <button
                className={styles.iconBtn}
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
              >
                {'>'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Image + canvas overlay */}
      <div className={styles.imageContainer} ref={scrollContainerRef}>
        {currentImageSrc ? (
          <div className={styles.imageWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImageSrc}
              alt={`Answer sheet page ${currentPage + 1}`}
              className={styles.answerImage}
              ref={el => {
                imgRef.current = el;
                if (el) el.onload = drawHighlights;
              }}
            />
            {hasHighlightsOnPage && (
              <canvas ref={canvasRef} className={styles.highlightCanvas} />
            )}
          </div>
        ) : (
          <div className={styles.noImage}>
            <p>No image available for this page</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Review Page ──────────────────────────────────────────────────────────
export default function ReviewPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<GradedItem | null>(null);
  
  // For mobile segmented control
  const [mobileTab, setMobileTab] = useState<'questions' | 'viewer'>('questions');

  useEffect(() => {
    const stored = sessionStorage.getItem('analysisResult');
    if (!stored) {
      router.push('/');
      return;
    }
    setResult(JSON.parse(stored));

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

  const highlightRegions = selectedItem ? selectedItem.answerRegions : [];

  const attemptedMaxMarks = result.gradedItems
    .filter(item => item.status === 'answered')
    .reduce((sum, item) => sum + (item.question?.maxMarks ?? 5), 0);

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar__inner">
          <div className={styles.navLeft}>
            <button className={styles.navBackBtn} onClick={() => router.push('/')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Exams
            </button>
          </div>
          <div className={styles.navRight}>
            <div className={styles.avatar}>MR</div>
          </div>
        </div>
      </nav>

      {/* Mobile Segmented Control */}
      <div className={styles.mobileTabs}>
        <div className={styles.segmentedControl}>
          <button 
            className={`${styles.segmentBtn} ${mobileTab === 'questions' ? styles.segmentActive : ''}`}
            onClick={() => setMobileTab('questions')}
          >
            Questions
          </button>
          <button 
            className={`${styles.segmentBtn} ${mobileTab === 'viewer' ? styles.segmentActive : ''}`}
            onClick={() => setMobileTab('viewer')}
          >
            Answer Sheet
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className={styles.layout}>
        {/* Left: Question List */}
        <aside className={`${styles.leftPanel} ${mobileTab === 'questions' ? styles.showOnMobile : styles.hideOnMobile}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Questions</h2>
              <p className={styles.panelSubtitle}>
                Score: <span className={styles.scoreHighlight}>{result.marksAwarded}/{attemptedMaxMarks}</span> (Attempted)
              </p>
            </div>
            <button className={styles.expandAllBtn} onClick={() => setSelectedItem(null)}>
              Collapse All
            </button>
          </div>

          <div className={styles.questionList}>
            {result.gradedItems.map((item, index) => (
              <QuestionItem
                key={`q-${index}-\${item.question?.id || 'no-id'}`}
                item={item}
                isExpanded={selectedItem === item}
                onToggle={() => {
                  if (selectedItem === item) setSelectedItem(null);
                  else {
                    setSelectedItem(item);
                    if (window.innerWidth <= 900) {
                      setMobileTab('viewer'); // Auto-switch on mobile when a question is clicked
                    }
                  }
                }}
              />
            ))}
          </div>
        </aside>

        {/* Right: Answer Viewer */}
        <main className={`${styles.centerPanel} ${mobileTab === 'viewer' ? styles.showOnMobile : styles.hideOnMobile}`}>
          <AnswerViewer
            images={answerImages}
            highlightRegions={highlightRegions}
            totalPages={answerImages.length || result.answerSheetPageCount}
          />
        </main>
      </div>
    </div>
  );
}
