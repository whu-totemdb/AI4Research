import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Spin } from 'antd';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import FloatingToolbar from './FloatingToolbar';
import PageAnnotations from './PdfAnnotation';
import TranslationPopup from './TranslationPopup';
import { translateStream } from '../api';
import {
  HIGHLIGHT_COLORS,
  type Highlight,
  type HighlightRect,
  type HighlightColor,
} from '../types/annotation';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  fileUrl: string;
  paperId: number;
  highlights: Highlight[];
  onCreateHighlight: (
    text: string,
    page: number,
    rects: HighlightRect[],
    pageYOffset: number,
    color: HighlightColor,
  ) => void;
  onAskAI?: (text: string, page: number) => void;
  onTextSelect?: (text: string, page: number) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  onCurrentPageChange?: (page: number, total: number) => void;
  showAnnotations?: boolean;
  onUpdateNote?: (id: string, note: string) => void;
  onDeleteHighlight?: (id: string) => void;
  translationEnabled?: boolean;
}

export default function PdfViewer({
  fileUrl,
  paperId,
  highlights,
  onCreateHighlight,
  onAskAI,
  onTextSelect,
  scrollContainerRef: externalScrollRef,
  scale: controlledScale,
  onScaleChange,
  onCurrentPageChange,
  showAnnotations,
  onUpdateNote,
  onDeleteHighlight,
  translationEnabled: externalTranslationEnabled,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Translation state
  const translationEnabled = externalTranslationEnabled ?? false;
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationText, setTranslationText] = useState('');
  const [translationResult, setTranslationResult] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationPos, setTranslationPos] = useState({ x: 0, y: 0 });

  // Page virtualization: only render pages near the viewport
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const observerRef = useRef<IntersectionObserver | null>(null);
  const estimatedPageHeightRef = useRef<number>(800);

  // Scale: support controlled + uncontrolled
  const [internalScale, setInternalScale] = useState(1.2);
  const scale = controlledScale ?? internalScale;

  // Local refs for PdfViewer's own DOM elements (never overwrite externalScrollRef)
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Setup IntersectionObserver for page virtualization
  useEffect(() => {
    const scrollContainer = externalScrollRef?.current;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const pageNum = parseInt(entry.target.getAttribute('data-page-num') || '0');
            if (pageNum === 0) return;
            if (entry.isIntersecting) {
              next.add(pageNum);
            } else {
              next.delete(pageNum);
            }
          });
          // Always keep page 1 visible for auto-fit calculations
          next.add(1);
          return next;
        });
      },
      {
        root: scrollContainer || null,
        rootMargin: '1000px 0px',
        threshold: 0,
      }
    );

    return () => observerRef.current?.disconnect();
  }, [externalScrollRef]);

  // Reset visible pages when document changes
  useEffect(() => {
    if (numPages > 0) {
      setVisiblePages(new Set([1]));
    }
  }, [numPages]);

  // Ctrl+Wheel zoom on the PDF container
  useEffect(() => {
    const container = outerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const update = (s: number) => Math.max(0.5, Math.min(3, Math.round((s + delta) * 10) / 10));
      if (onScaleChange) {
        onScaleChange(update(scale));
      } else {
        setInternalScale(prev => update(prev));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, onScaleChange]);

  // Scroll anchor for zoom stability
  const scrollAnchorRef = useRef<{ page: number; ratio: number } | null>(null);
  const prevScaleRef = useRef(scale);
  useLayoutEffect(() => {
    if (prevScaleRef.current !== scale) {
      const container = externalScrollRef?.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const midY = containerRect.top + containerRect.height / 2;

        for (let i = 1; i <= numPages; i++) {
          const el = pageRefs.current[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top <= midY && rect.bottom >= midY) {
            const ratio = (midY - rect.top) / rect.height;
            scrollAnchorRef.current = { page: i, ratio };
            break;
          }
        }
      }
      prevScaleRef.current = scale;
    }
  }, [scale, numPages, externalScrollRef]);

  // Floating toolbar state
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    page: number;
    rects: HighlightRect[];
    pageYOffset: number;
  } | null>(null);

  const onDocumentLoadSuccess = useCallback(async ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setLoading(false);

    // Auto fit-width on first load using pdfjs to get original page dimensions
    if (!hasAutoFit.current) {
      try {
        const pdf = await pdfjs.getDocument(fileUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const pageOriginalWidth = viewport.width;

        // Wait a frame for the container to be laid out
        requestAnimationFrame(() => {
          const container = externalScrollRef?.current;
          if (container && pageOriginalWidth > 0) {
            const annotationWidth = showAnnotations ? 268 : 0;
            const containerWidth = container.clientWidth - annotationWidth - 24;
            const fitScale = containerWidth / pageOriginalWidth;
            const clamped = Math.max(0.5, Math.min(3, fitScale));
            hasAutoFit.current = true;
            if (onScaleChange) onScaleChange(clamped);
            else setInternalScale(clamped);
          }
        });
      } catch (e) {
        console.warn('Auto fit-width failed:', e);
      }
    }
  }, [fileUrl, externalScrollRef, showAnnotations, onScaleChange]);

  // Auto fit-width flag (used inside onDocumentLoadSuccess)
  const hasAutoFit = useRef(false);

  // Track rendered pages to know when all are ready
  const renderedPagesRef = useRef(new Set<number>());

  const handlePageRenderSuccess = useCallback((pageNum: number) => {
    renderedPagesRef.current.add(pageNum);

    // Track page height for virtualization placeholders
    const el = pageRefs.current[pageNum];
    if (el) {
      estimatedPageHeightRef.current = el.getBoundingClientRect().height;
    }

    if (renderedPagesRef.current.size === numPages && numPages > 0) {
      const anchor = scrollAnchorRef.current;
      const container = externalScrollRef?.current;
      if (anchor && container) {
        const anchorEl = pageRefs.current[anchor.page];
        if (anchorEl) {
          const containerRect = container.getBoundingClientRect();
          const elRect = anchorEl.getBoundingClientRect();
          const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) + (elRect.height * anchor.ratio) - containerRect.height / 2;
          container.scrollTop = Math.max(0, targetScrollTop);
        }
        scrollAnchorRef.current = null;
      }
    }
  }, [numPages, externalScrollRef, showAnnotations, scale, onScaleChange]);

  // Reset rendered pages counter when numPages or scale changes
  useEffect(() => {
    renderedPagesRef.current = new Set();
  }, [numPages, scale]);

  // Notify parent of current page changes
  useEffect(() => {
    if (onCurrentPageChange && numPages > 0) {
      onCurrentPageChange(currentPage, numPages);
    }
  }, [currentPage, numPages, onCurrentPageChange]);

  // Listen to scroll events on the external scroll container
  useEffect(() => {
    const container = externalScrollRef?.current;
    if (!container) return;

    const onScroll = () => {
      // Update current page based on scroll position
      const containerRect = container.getBoundingClientRect();
      const midY = containerRect.top + containerRect.height / 2;

      for (let i = 1; i <= numPages; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) {
          setCurrentPage(i);
          break;
        }
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [numPages, externalScrollRef]);

  // --- Text selection -> highlight creation ---
  const handleMouseUp = useCallback(async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setToolbarVisible(false);
      return;
    }
    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);

    // Walk up to find .react-pdf__Page
    let node: Node | null = range.startContainer;
    let pageEl: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.classList.contains('react-pdf__Page')) {
        pageEl = node;
        break;
      }
      node = node.parentNode;
    }
    if (!pageEl) return;

    const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '1');
    const pageRect = pageEl.getBoundingClientRect();
    const clientRects = range.getClientRects();

    const rects: HighlightRect[] = Array.from(clientRects).map(cr => ({
      x: ((cr.left - pageRect.left) / pageRect.width) * 100,
      y: ((cr.top - pageRect.top) / pageRect.height) * 100,
      w: (cr.width / pageRect.width) * 100,
      h: (cr.height / pageRect.height) * 100,
    }));

    const pageYOffset = rects.length > 0 ? rects[0].y : 0;

    // Position toolbar near end of selection
    const lastRect = clientRects[clientRects.length - 1];
    setToolbarPos({ x: lastRect.right + 8, y: lastRect.top - 10 });
    setPendingSelection({ text, page: pageNum, rects, pageYOffset });
    setToolbarVisible(true);

    // Auto-update context in right panel
    onTextSelect?.(text, pageNum);

    // Auto-translate if enabled
    if (translationEnabled) {
      // Position logic:
      // - If popup is not visible (user closed it or first time), set position near selection
      // - If popup is already visible (user is selecting multiple times), keep current position
      if (!translationVisible) {
        const scrollContainer = externalScrollRef?.current;
        const scrollTop = scrollContainer?.scrollTop || 0;
        const scrollLeft = scrollContainer?.scrollLeft || 0;

        setTranslationPos({
          x: lastRect.left - scrollLeft,
          y: lastRect.bottom - scrollTop + 8,
        });
      }

      // Always update content regardless of position
      setTranslationText(text);
      setTranslationResult('');
      setTranslationLoading(true);
      setTranslationVisible(true);

      try {
        let result = '';
        for await (const chunk of translateStream(text)) {
          result += chunk;
          setTranslationResult(result);
        }
      } catch (error) {
        console.error('Translation failed:', error);
        setTranslationResult('翻译失败');
      } finally {
        setTranslationLoading(false);
      }
    }
  }, [onTextSelect, translationEnabled, translationVisible, externalScrollRef]);

  // --- Dismiss toolbar on outside click or scroll ---
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-floating-toolbar]')) {
        setToolbarVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!toolbarVisible) return;
    const container = externalScrollRef?.current;
    if (!container) return;
    const dismiss = () => setToolbarVisible(false);
    container.addEventListener('scroll', dismiss, { passive: true });
    return () => container.removeEventListener('scroll', dismiss);
  }, [toolbarVisible, externalScrollRef]);

  // --- Highlight overlays ---
  function renderHighlightsForPage(pageNum: number) {
    const pageHighlights = highlights.filter(h => h.page === pageNum);
    if (pageHighlights.length === 0) return null;
    return (
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 2 }}>
        {pageHighlights.flatMap(h =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              style={{
                position: 'absolute',
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.w}%`,
                height: `${r.h}%`,
                backgroundColor: HIGHLIGHT_COLORS[h.color].bg,
                mixBlendMode: 'multiply',
                pointerEvents: 'none',
              }}
            />
          )),
        )}
      </div>
    );
  }

  // --- Toolbar actions ---
  const handlePickColor = useCallback(
    (color: HighlightColor) => {
      console.log('DEBUG: handlePickColor called with:', { color, pendingSelection });
      if (pendingSelection) {
        onCreateHighlight(
          pendingSelection.text,
          pendingSelection.page,
          pendingSelection.rects,
          pendingSelection.pageYOffset,
          color,
        );
      }
      setToolbarVisible(false);
      window.getSelection()?.removeAllRanges();
    },
    [pendingSelection, onCreateHighlight],
  );

  const handleAskAI = useCallback(() => {
    if (pendingSelection) {
      onAskAI?.(pendingSelection.text, pendingSelection.page);
    }
    setToolbarVisible(false);
    window.getSelection()?.removeAllRanges();
  }, [pendingSelection, onAskAI]);

  return (
    <div ref={outerRef}>
      <div
        ref={contentRef}
        onMouseUp={handleMouseUp}
        style={{
          background: '#e8e8e8',
          padding: '12px 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {loading && (
          <Spin
            size="large"
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          />
        )}
        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} loading="">
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i + 1;
            const isVisible = visiblePages.has(pageNum);
            return (
              <div
                key={pageNum}
                data-page-num={pageNum}
                ref={el => {
                  if (el) {
                    pageRefs.current[pageNum] = el;
                    observerRef.current?.observe(el);
                  }
                }}
                style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}
              >
                {isVisible ? (
                  <>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Page
                        pageNumber={pageNum}
                        scale={scale}
                        onRenderSuccess={() => handlePageRenderSuccess(pageNum)}
                      />
                      {renderHighlightsForPage(pageNum)}
                    </div>
                    {showAnnotations && (
                      <div style={{ width: 260, flexShrink: 0, marginLeft: 8, position: 'relative' }}>
                        <PageAnnotations
                          highlights={highlights.filter(h => h.page === pageNum)}
                          onUpdateNote={onUpdateNote || (() => {})}
                          onDelete={onDeleteHighlight || (() => {})}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ height: estimatedPageHeightRef.current, width: '100%' }} />
                )}
              </div>
            );
          })}
        </Document>
      </div>
      <FloatingToolbar
        visible={toolbarVisible}
        x={toolbarPos.x}
        y={toolbarPos.y}
        onPickColor={handlePickColor}
        onAskAI={handleAskAI}
      />
      {translationVisible && (
        <TranslationPopup
          translation={translationResult}
          loading={translationLoading}
          position={translationPos}
          onClose={() => setTranslationVisible(false)}
        />
      )}
    </div>
  );
}
