import { useState } from 'react';
import { Tooltip } from 'antd';
import { MessageOutlined, CodeOutlined, FileTextOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import ChatPanel from './ChatPanel';
import TerminalPanel from './TerminalPanel';
import SummaryPanel from './SummaryPanel';

interface AIToolboxProps {
  paperId: number;
  paperTitle: string;
  selectedText: string | null;
  selectedPage: number | null;
  matchedMarkdown: string | null;
  matchConfidence: number;
  collapsed: boolean;
  onToggle: () => void;
  contextFiles: string[];
  onContextFilesChange: (files: string[]) => void;
  toolboxWidth?: number;
  onWidthChange?: (width: number) => void;
  onRefreshFiles?: () => void;
  notesRefreshKey?: number;
  onNoteSaved?: () => void;
  onClearSelection?: () => void;
  pageIndexExists?: boolean | null;
  pageIndexGenerating?: boolean;
  onGeneratePageIndex?: () => void;
  hasMarkdown?: boolean;
}

type ToolType = 'chat' | 'terminal' | 'summary';

const tools: { key: ToolType; icon: React.ReactNode; label: string }[] = [
  { key: 'chat', icon: <MessageOutlined />, label: '上下文问答' },
  { key: 'terminal', icon: <CodeOutlined />, label: 'Claude Code' },
  { key: 'summary', icon: <FileTextOutlined />, label: '全文总结' },
];

export default function AIToolbox({
  paperId,
  paperTitle,
  selectedText,
  matchedMarkdown,
  collapsed,
  onToggle,
  contextFiles,
  onContextFilesChange,
  toolboxWidth,
  onWidthChange,
  onRefreshFiles,
  notesRefreshKey,
  onNoteSaved,
  onClearSelection,
  pageIndexExists,
  pageIndexGenerating,
  onGeneratePageIndex,
  hasMarkdown,
}: AIToolboxProps) {
  const [activeTool, setActiveTool] = useState<ToolType>('chat');

  if (collapsed) {
    return (
      <div style={{ width: 36, height: '100%', background: '#fafafa', borderLeft: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8 }}>
        <div onClick={onToggle} style={{ cursor: 'pointer', padding: '8px 0', color: '#666' }}>
          <LeftOutlined />
        </div>
        {tools.map(t => (
          <Tooltip key={t.key} title={t.label} placement="left">
            <div
              onClick={() => { setActiveTool(t.key); onToggle(); }}
              style={{ cursor: 'pointer', padding: '12px 0', color: activeTool === t.key ? '#1677ff' : '#999', fontSize: 16 }}
            >
              {t.icon}
            </div>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e8e8e8', position: 'relative' }}>
      {/* Drag handle */}
      {toolboxWidth !== undefined && onWidthChange && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = toolboxWidth;
            const onMouseMove = (ev: MouseEvent) => {
              const newWidth = Math.max(280, Math.min(800, startWidth + (startX - ev.clientX)));
              onWidthChange(newWidth);
            };
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: 'col-resize',
            zIndex: 10,
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#1677ff40'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
        />
      )}
      {/* Header bar with tool tabs and collapse button */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e8e8e8', background: '#fafafa', padding: '0 4px', height: 40, flexShrink: 0 }}>
        {tools.map(t => (
          <div
            key={t.key}
            onClick={() => setActiveTool(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 12px', cursor: 'pointer', fontSize: 13,
              color: activeTool === t.key ? '#1677ff' : '#666',
              borderBottom: activeTool === t.key ? '2px solid #1677ff' : '2px solid transparent',
              fontWeight: activeTool === t.key ? 500 : 400,
            }}
          >
            {t.icon} {t.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div onClick={onToggle} style={{ cursor: 'pointer', padding: '4px 8px', color: '#999' }}>
          <RightOutlined />
        </div>
      </div>

      {/* Tool content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeTool === 'chat' && (
          <ChatPanel
            paperId={paperId}
            selectedText={selectedText}
            matchedMarkdown={matchedMarkdown}
            contextFiles={contextFiles}
            onContextFilesChange={onContextFilesChange}
            onRefreshFiles={onRefreshFiles}
            notesRefreshKey={notesRefreshKey}
            onNoteSaved={onNoteSaved}
            onClearSelection={onClearSelection}
            pageIndexExists={pageIndexExists}
            pageIndexGenerating={pageIndexGenerating}
            onGeneratePageIndex={onGeneratePageIndex}
            hasMarkdown={hasMarkdown}
          />
        )}
        {activeTool === 'terminal' && (
          <TerminalPanel paperId={paperId} paperTitle={paperTitle} />
        )}
        {activeTool === 'summary' && (
          <SummaryPanel paperId={paperId} onRefreshFiles={onRefreshFiles} notesRefreshKey={notesRefreshKey} onNoteSaved={onNoteSaved} />
        )}
      </div>
    </div>
  );
}
