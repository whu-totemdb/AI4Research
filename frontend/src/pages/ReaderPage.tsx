import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Tooltip, message, Tabs, Space } from 'antd';
import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  RobotOutlined,
  ReadOutlined,
  HomeOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  HighlightOutlined,
  TranslationOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import PdfViewer from '../components/PdfViewer';
import AIToolbox from '../components/AIToolbox';
import type { Paper } from '../types';
import type { Highlight, HighlightRect, HighlightColor } from '../types/annotation';
import { getPaper, triggerSync, createNote, updateNote, deleteNote, getPageIndexStatus, generatePageIndex } from '../api';

const STORAGE_KEY_PAPERS = 'reader-open-papers';
const STORAGE_KEY_ACTIVE = 'reader-active-id';
const STORAGE_KEY_TRANSLATION = 'reader-translation-enabled';

interface OpenPaper {
  id: number;
  title: string;
}

interface PaperState {
  paper: Paper | null;
  loading: boolean;
  selectedText: string | null;
  selectedPage: number | null;
  matchedMarkdown: string | null;
  matchConfidence: number;
  toolboxCollapsed: boolean;
  toolboxWidth: number;
  contextFiles: string[];
  notesRefreshKey: number;
}

function createPaperState(): PaperState {
  return {
    paper: null,
    loading: true,
    selectedText: null,
    selectedPage: null,
    matchedMarkdown: null,
    matchConfidence: 0,
    toolboxCollapsed: false,
    toolboxWidth: 420,
    contextFiles: [],
    notesRefreshKey: 0,
  };
}

/* ---------- Single paper content (rendered per tab, hidden when inactive) ---------- */

function SinglePaperContent({
  paperId,
  visible,
  stateRef,
  onLoaded,
  onLoadError,
  onRefreshFiles,
  onNotesRefresh,
}: {
  paperId: number;
  visible: boolean;
  stateRef: React.MutableRefObject<Record<number, PaperState>>;
  onLoaded: (id: number, paper: Paper) => void;
  onLoadError: (id: number) => void;
  onRefreshFiles?: () => void;
  onNotesRefresh?: (paperId: number) => void;
}) {
  const s = stateRef.current[paperId] ?? createPaperState();

  const [paper, setPaper] = useState<Paper | null>(s.paper);
  const [loading, setLoading] = useState(s.loading);
  const [selectedText, setSelectedText] = useState<string | null>(s.selectedText);
  const [selectedPage, setSelectedPage] = useState<number | null>(s.selectedPage);
  const [matchedMarkdown, setMatchedMarkdown] = useState<string | null>(s.matchedMarkdown);
  const [matchConfidence, setMatchConfidence] = useState(s.matchConfidence);
  const [toolboxCollapsed, setToolboxCollapsed] = useState(s.toolboxCollapsed);
  const [toolboxWidth, setToolboxWidth] = useState(s.toolboxWidth);
  const [contextFiles, setContextFiles] = useState<string[]>(s.contextFiles);
  const [notesRefreshKey, setNotesRefreshKey] = useState(s.notesRefreshKey);

  // Translation enabled state (global, persisted to localStorage)
  const [translationEnabled, setTranslationEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRANSLATION);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // PageIndex state
  const [pageIndexExists, setPageIndexExists] = useState<boolean | null>(null);
  const [pageIndexGenerating, setPageIndexGenerating] = useState(false);

  // Persist translation enabled state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRANSLATION, JSON.stringify(translationEnabled));
  }, [translationEnabled]);

  // Sync local state back to ref so it survives across visibility toggles
  useEffect(() => {
    stateRef.current[paperId] = {
      paper, loading, selectedText, selectedPage,
      matchedMarkdown, matchConfidence, toolboxCollapsed,
      toolboxWidth, contextFiles, notesRefreshKey,
    };
  });

  // Listen for external refresh triggers from other tabs
  useEffect(() => {
    const currentRefreshKey = stateRef.current[paperId]?.notesRefreshKey ?? 0;
    if (currentRefreshKey !== notesRefreshKey) {
      setNotesRefreshKey(currentRefreshKey);
    }
  }, [paperId, stateRef, notesRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await getPaper(paperId);
        if (cancelled) return;
        const p = res.data as Paper;
        setPaper(p);
        onLoaded(paperId, p);

        // Check PageIndex status
        if (p.has_markdown) {
          try {
            const statusRes = await getPageIndexStatus(paperId);
            if (!cancelled) {
              setPageIndexExists(statusRes.data.exists);
            }
          } catch (err) {
            console.error('Failed to check PageIndex status:', err);
          }
        }
      } catch {
        if (!cancelled) {
          message.error('加载论文失败');
          onLoadError(paperId);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (!paper) load();
    else setLoading(false);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  const handleTextSelect = useCallback((text: string, page: number) => {
    setSelectedText(text);
    setSelectedPage(page);
  }, []);

  const handleAskAI = useCallback((text: string, page: number) => {
    setSelectedText(text);
    setSelectedPage(page);
    setToolboxCollapsed(false);
  }, []);

  const handleMatchResult = useCallback((matched: string | null, confidence: number) => {
    setMatchedMarkdown(matched);
    setMatchConfidence(confidence);
  }, []);

  // Highlight state (persisted to localStorage)
  const [highlights, setHighlights] = useState<Highlight[]>(() => {
    try {
      const raw = localStorage.getItem(`paper-highlights-${paperId}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(`paper-highlights-${paperId}`, JSON.stringify(highlights));
  }, [paperId, highlights]);

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `paper-highlights-${paperId}` && e.newValue) {
        try {
          const updatedHighlights = JSON.parse(e.newValue);
          setHighlights(updatedHighlights);
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [paperId]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pdfScale, setPdfScale] = useState(1.2);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Fit-width handler — PdfViewer now handles annotation column width internally
  const handleFitWidth = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const firstPage = container.querySelector('.react-pdf__Page') as HTMLElement;
    if (!firstPage) return;
    const annotationWidth = showAnnotations ? 268 : 0;
    const containerWidth = container.clientWidth - annotationWidth - 24;
    const pageWidth = firstPage.scrollWidth / pdfScale;
    if (pageWidth > 0) {
      const fitScale = Math.max(0.5, Math.min(3, containerWidth / pageWidth));
      setPdfScale(fitScale);
    }
  }, [pdfScale, showAnnotations]);

  // Ctrl+Wheel zoom for PDF
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setPdfScale(s => Math.max(0.5, Math.min(3, Math.round((s + delta) * 10) / 10)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Auto fit width when tab becomes visible
  useEffect(() => {
    if (visible && paper) {
      // Wait for PDF to render, then fit width
      const timer = setTimeout(() => {
        handleFitWidth();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible, paper, handleFitWidth]);

  const handleCreateHighlight = useCallback(async (text: string, page: number, rects: HighlightRect[], pageYOffset: number, color: HighlightColor) => {
    const newHighlight: Highlight = {
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      paperId,
      text,
      note: '',
      color,
      page,
      rects,
      pageYOffset,
      createdAt: new Date().toISOString(),
    };
    setHighlights(prev => [...prev, newHighlight]);

    // Save to backend
    try {
      const response = await createNote({
        paper_id: paperId,
        content: '',
        selection_text: text,
        page_number: page,
        note_type: 'highlight',
        color: color,
        position_data: { rects, pageYOffset },
      });

      // Update highlight with backend ID
      const backendId = response.data.id;
      setHighlights(prev => prev.map(h =>
        h.id === newHighlight.id ? { ...h, id: `note-${backendId}` } : h
      ));

      // Trigger file list refresh
      if (onRefreshFiles) {
        onRefreshFiles();
      }
    } catch (error) {
      console.error('Failed to save highlight:', error);
      message.error('保存批注失败');
    }
  }, [paperId, onRefreshFiles]);

  const handleUpdateNote = useCallback(async (id: string, note: string, title?: string) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, note, title } : h));

    // Save to backend if it's a backend note
    if (id.startsWith('note-')) {
      const noteId = parseInt(id.replace('note-', ''));
      try {
        await updateNote(noteId, { content: note, title });

        // Trigger file list refresh
        if (onRefreshFiles) {
          onRefreshFiles();
        }
      } catch (error) {
        console.error('Failed to update note:', error);
        message.error('更新笔记失败');
      }
    }
  }, [onRefreshFiles]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));

    // Delete from backend if it's a backend note
    if (id.startsWith('note-')) {
      const noteId = parseInt(id.replace('note-', ''));
      try {
        await deleteNote(noteId);

        // Trigger file list refresh
        if (onRefreshFiles) {
          onRefreshFiles();
        }
      } catch (error) {
        console.error('Failed to delete note:', error);
        message.error('删除批注失败');
      }
    }
  }, [onRefreshFiles]);

  const handleGeneratePageIndex = useCallback(async () => {
    if (!paper) return;

    if (!paper.has_markdown) {
      message.warning('请先转换 PDF 为 Markdown');
      return;
    }

    setPageIndexGenerating(true);
    const hideLoading = message.loading('正在生成 PageIndex...', 0);

    try {
      const { generatePageIndexStream } = await import('../api');

      for await (const chunk of generatePageIndexStream(paperId)) {
        if (chunk.error) {
          hideLoading();
          message.error(chunk.error);
          setPageIndexGenerating(false);
          return;
        }

        if (chunk.message) {
          // 更新加载提示
          hideLoading();
          message.loading(chunk.message, 0);
        }

        if (chunk.status === 'completed') {
          hideLoading();
          setPageIndexExists(true);
          message.success('PageIndex 生成成功！现在可以使用 Agent 模式的 PageIndex 工具了');
          break;
        }
      }
    } catch (error: any) {
      hideLoading();
      console.error('Failed to generate PageIndex:', error);
      message.error(error.message || '生成 PageIndex 失败');
    } finally {
      setPageIndexGenerating(false);
    }
  }, [paper, paperId]);

  const pdfUrl = paper ? `/api/papers/${paper.id}/file` : '';

  if (loading) {
    return (
      <div style={{ display: visible ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ display: visible ? 'flex' : 'none', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* Shared scroll container for PDF + Annotations */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
        }}
      >
        {/* PDF Toolbar - sticky, full width */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Space>
            <Tooltip title="缩小">
              <Button type="text" icon={<ZoomOutOutlined />} onClick={() => setPdfScale(s => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))} />
            </Tooltip>
            <span style={{ fontSize: 13, minWidth: 40, textAlign: 'center' }}>{Math.round(pdfScale * 100)}%</span>
            <Tooltip title="放大">
              <Button type="text" icon={<ZoomInOutlined />} onClick={() => setPdfScale(s => Math.min(3, Math.round((s + 0.1) * 10) / 10))} />
            </Tooltip>
            <Tooltip title="适应宽度">
              <Button type="text" icon={<FullscreenOutlined />} onClick={handleFitWidth} />
            </Tooltip>
          </Space>
          <span style={{ fontSize: 13, color: '#666' }}>
            {currentPage} / {totalPages}
          </span>
          <Space>
            <Tooltip title={showAnnotations ? '隐藏批注' : '显示批注'}>
              <Button
                type={showAnnotations ? 'primary' : 'text'}
                icon={<HighlightOutlined />}
                onClick={() => setShowAnnotations(v => !v)}
                style={showAnnotations ? {} : { opacity: 0.5 }}
              />
            </Tooltip>
            <Tooltip title={translationEnabled ? '关闭划词翻译' : '开启划词翻译'}>
              <Button
                type={translationEnabled ? 'primary' : 'text'}
                icon={<TranslationOutlined />}
                onClick={() => setTranslationEnabled(v => !v)}
                style={translationEnabled ? {} : { opacity: 0.5 }}
              />
            </Tooltip>
          </Space>
        </div>
        {/* Content: PDF with inline annotations */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {pdfUrl ? (
            <PdfViewer
              fileUrl={pdfUrl}
              paperId={paperId}
              highlights={highlights}
              onCreateHighlight={handleCreateHighlight}
              onTextSelect={(text: string, page: number) => {
                setSelectedText(text);
                setSelectedPage(page);
              }}
              onAskAI={(text: string, page: number) => {
                setSelectedText(text);
                setSelectedPage(page);
                setToolboxCollapsed(false);
              }}
              scrollContainerRef={scrollContainerRef}
              scale={pdfScale}
              onScaleChange={setPdfScale}
              onCurrentPageChange={(page: number, total: number) => {
                setCurrentPage(page);
                setTotalPages(total);
              }}
              showAnnotations={showAnnotations}
              onUpdateNote={handleUpdateNote}
              onDeleteHighlight={handleDeleteHighlight}
              translationEnabled={translationEnabled}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              没有 PDF 文件
            </div>
          )}
        </div>
      </div>
      {/* AI Toolbox - separate, not in scroll */}
      {!toolboxCollapsed ? (
        <div style={{ width: toolboxWidth, flexShrink: 0, borderLeft: '1px solid #e8e8e8' }}>
          <AIToolbox
            paperId={paperId}
            paperTitle={paper?.title || ''}
            selectedText={selectedText}
            selectedPage={selectedPage}
            matchedMarkdown={matchedMarkdown}
            matchConfidence={matchConfidence}
            collapsed={toolboxCollapsed}
            onToggle={() => setToolboxCollapsed((c) => !c)}
            contextFiles={contextFiles}
            onContextFilesChange={setContextFiles}
            toolboxWidth={toolboxWidth}
            onWidthChange={setToolboxWidth}
            onRefreshFiles={onRefreshFiles}
            notesRefreshKey={notesRefreshKey}
            onNoteSaved={() => onNotesRefresh?.(paperId)}
            onClearSelection={() => { setSelectedText(null); setMatchedMarkdown(null); }}
            pageIndexExists={pageIndexExists}
            pageIndexGenerating={pageIndexGenerating}
            onGeneratePageIndex={handleGeneratePageIndex}
            hasMarkdown={paper?.has_markdown}
          />
        </div>
      ) : (
        <AIToolbox
          paperId={paperId}
          paperTitle={paper?.title || ''}
          selectedText={selectedText}
          selectedPage={selectedPage}
          matchedMarkdown={matchedMarkdown}
          matchConfidence={matchConfidence}
          collapsed={toolboxCollapsed}
          onToggle={() => setToolboxCollapsed((c) => !c)}
          contextFiles={contextFiles}
          onContextFilesChange={setContextFiles}
          onRefreshFiles={onRefreshFiles}
          notesRefreshKey={notesRefreshKey}
          onNoteSaved={() => onNotesRefresh?.(paperId)}
          onClearSelection={() => { setSelectedText(null); setMatchedMarkdown(null); }}
          pageIndexExists={pageIndexExists}
          pageIndexGenerating={pageIndexGenerating}
          onGeneratePageIndex={handleGeneratePageIndex}
          hasMarkdown={paper?.has_markdown}
        />
      )}
    </div>
  );
}

/* ---------- Main ReaderPage ---------- */

export default function ReaderPage() {
  const { id: urlId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [openPapers, setOpenPapers] = useState<OpenPaper[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PAPERS);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [activeId, setActiveId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE);
      return saved ? Number(JSON.parse(saved)) : null;
    } catch { return null; }
  });

  const [syncing, setSyncing] = useState(false);

  // Per-paper state preserved across tab switches
  const paperStates = useRef<Record<number, PaperState>>({});

  // Persist openPapers to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PAPERS, JSON.stringify(openPapers));
  }, [openPapers]);

  // Persist activeId to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeId));
  }, [activeId]);

  // When URL id changes, add paper to tabs
  useEffect(() => {
    if (!urlId) return;
    const id = Number(urlId);
    if (isNaN(id)) return;
    setOpenPapers((prev) => {
      if (prev.find((p) => p.id === id)) return prev;
      return [...prev, { id, title: `论文 #${id}` }];
    });
    setActiveId(id);
  }, [urlId]);

  const handlePaperLoaded = useCallback((id: number, paper: Paper) => {
    setOpenPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title: paper.title || `论文 #${id}` } : p)),
    );
  }, []);

  const handleLoadError = useCallback(
    (id: number) => {
      setOpenPapers((prev) => prev.filter((p) => p.id !== id));
      setActiveId((prev) => {
        if (prev === id) {
          const remaining = openPapers.filter((p) => p.id !== id);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
        return prev;
      });
    },
    [openPapers],
  );

  const handleTabChange = (key: string) => {
    const id = Number(key);
    setActiveId(id);
    navigate(`/reader/${id}`, { replace: true });
  };

  const handleTabEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove',
  ) => {
    if (action !== 'remove') return;
    const removeId = Number(targetKey);
    // Clean up state
    delete paperStates.current[removeId];

    setOpenPapers((prev) => {
      const next = prev.filter((p) => p.id !== removeId);
      if (activeId === removeId) {
        const idx = prev.findIndex((p) => p.id === removeId);
        const newActive = next[Math.min(idx, next.length - 1)];
        if (newActive) {
          setActiveId(newActive.id);
          navigate(`/reader/${newActive.id}`, { replace: true });
        } else {
          setActiveId(null);
          navigate('/', { replace: true });
        }
      }
      return next;
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      message.success('同步完成');
    } catch {
      message.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  // Handle notes refresh - update all tabs viewing the same paper
  const handleNotesRefresh = useCallback((paperId: number) => {
    // Increment the refresh key for this paper in all tabs
    if (paperStates.current[paperId]) {
      const currentKey = paperStates.current[paperId].notesRefreshKey ?? 0;
      paperStates.current[paperId].notesRefreshKey = currentKey + 1;

      // Force re-render of all SinglePaperContent components
      // by updating the openPapers array (triggers React re-render)
      setOpenPapers(prev => [...prev]);
    }
  }, []);

  // No papers open
  if (openPapers.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', padding: '0 16px',
            borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0,
            height: 48, gap: 10,
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginRight: 12, flexShrink: 0 }}
            onClick={() => navigate('/')}
          >
            <ReadOutlined style={{ fontSize: 20, color: '#1a73e8' }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1a73e8', whiteSpace: 'nowrap' }}>AI4Research</span>
          </div>
          <Tooltip title="返回论文库">
            <Button
              type="text"
              icon={<HomeOutlined />}
              onClick={() => navigate('/')}
              style={{ color: '#666', marginRight: 4 }}
            >
              论文库
            </Button>
          </Tooltip>
          <span style={{ flex: 1, fontWeight: 500, fontSize: 14, color: '#999' }}>论文阅读</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
          请从论文列表中选择论文打开
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Combined header: AI4Research title + paper tabs + action buttons in ONE line */}
      <div
        style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0,
          height: 48, padding: '0 8px 0 16px',
        }}
      >
        {/* Left: logo + title */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginRight: 12, flexShrink: 0 }}
          onClick={() => navigate('/')}
        >
          <ReadOutlined style={{ fontSize: 20, color: '#1a73e8' }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1a73e8', whiteSpace: 'nowrap' }}>AI4Research</span>
        </div>
        <Tooltip title="返回论文库">
          <Button
            type="text"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#666', marginRight: 4 }}
          >
            论文库
          </Button>
        </Tooltip>

        {/* Center: paper tabs */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeId != null ? String(activeId) : undefined}
            onChange={handleTabChange}
            onEdit={handleTabEdit}
            size="small"
            style={{ marginBottom: 0 }}
            tabBarStyle={{ margin: 0, borderBottom: 'none' }}
            items={openPapers.map((p) => ({
              key: String(p.id),
              label: (
                <span
                  style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
                  title={p.title}
                >
                  {p.title}
                </span>
              ),
              closable: true,
            }))}
          />
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
          <Tooltip title="同步">
            <Button
              type="text"
              icon={<CloudSyncOutlined spin={syncing} />}
              onClick={handleSync}
              disabled={syncing}
            />
          </Tooltip>
          <Tooltip title="收起/展开 AI 工具箱">
            <Button
              type="text"
              icon={<RobotOutlined />}
              onClick={() => {
                if (activeId != null && paperStates.current[activeId]) {
                  // Toggle is handled inside SinglePaperContent
                }
              }}
            />
          </Tooltip>
        </div>
      </div>

      {/* Paper content - all rendered, only active visible */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {openPapers.map((p) => (
          <SinglePaperContent
            key={p.id}
            paperId={p.id}
            visible={p.id === activeId}
            stateRef={paperStates}
            onLoaded={handlePaperLoaded}
            onLoadError={handleLoadError}
            onRefreshFiles={() => {
              // Trigger file list refresh for the active paper
              // This will be handled by the PaperFileExplorer component
              window.dispatchEvent(new CustomEvent('refreshPaperFiles', { detail: { paperId: p.id } }));
            }}
            onNotesRefresh={handleNotesRefresh}
          />
        ))}
      </div>
    </div>
  );
}
