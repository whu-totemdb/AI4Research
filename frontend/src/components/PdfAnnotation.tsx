import { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Input } from 'antd';
import { HIGHLIGHT_COLORS, type Highlight } from '../types/annotation';

interface AnnotationCardProps {
  highlight: Highlight;
  onUpdateNote: (id: string, note: string, title?: string) => void;
  onDelete: (id: string) => void;
}

function AnnotationCard({ highlight, onUpdateNote, onDelete }: AnnotationCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(highlight.note);
  const [titleText, setTitleText] = useState(highlight.title || '');
  const colorInfo = HIGHLIGHT_COLORS[highlight.color];

  const displayNote = highlight.note?.trim();
  const displayTitle = highlight.title?.trim();

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${colorInfo.border}`,
        borderLeft: `3px solid ${colorInfo.border}`,
        borderRadius: 4,
        padding: '4px 6px',
        fontSize: 13,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header with color label, selected text and delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ color: colorInfo.border, fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
            {colorInfo.label}
          </span>
          <div
            style={{
              fontSize: 12,
              color: '#666',
              background: colorInfo.bg,
              padding: '2px 4px',
              borderRadius: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {highlight.text.slice(0, 80)}{highlight.text.length > 80 ? '...' : ''}
          </div>
        </div>
        <Button
          type="text"
          size="small"
          danger
          onClick={() => onDelete(highlight.id)}
          style={{ padding: '0 4px', height: 20, fontSize: 12, flexShrink: 0 }}
        >
          ×
        </Button>
      </div>
      {/* Title */}
      {editingTitle ? (
        <Input
          size="small"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          onBlur={() => {
            setEditingTitle(false);
            onUpdateNote(highlight.id, highlight.note, titleText);
          }}
          placeholder="标题"
          autoFocus
          style={{ fontSize: 12, marginBottom: 2 }}
        />
      ) : (
        <div
          onClick={() => {
            setTitleText(highlight.title || '');
            setEditingTitle(true);
          }}
          style={{
            fontSize: 12,
            color: displayTitle ? '#333' : '#999',
            cursor: 'pointer',
            marginBottom: 2,
            minHeight: 18,
            whiteSpace: 'pre-wrap',
          }}
        >
          {displayTitle || '点击添加标题...'}
        </div>
      )}
      {/* Note */}
      {editingNote ? (
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => {
            setEditingNote(false);
            onUpdateNote(highlight.id, noteText, highlight.title);
          }}
          placeholder="笔记内容"
          autoFocus
          style={{ fontSize: 12 }}
        />
      ) : (
        <div
          onClick={() => {
            setNoteText(highlight.note);
            setEditingNote(true);
          }}
          style={{
            fontSize: 12,
            color: displayNote ? '#333' : '#aaa',
            cursor: 'pointer',
            minHeight: 18,
            whiteSpace: 'pre-wrap',
          }}
        >
          {displayNote || '点击添加笔记...'}
        </div>
      )}
    </div>
  );
}

export interface PageAnnotationsProps {
  highlights: Highlight[];
  onUpdateNote: (id: string, note: string, title?: string) => void;
  onDelete: (id: string) => void;
}

export default function PageAnnotations({ highlights, onUpdateNote, onDelete }: PageAnnotationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // Observe container height (matches PDF page height since they share a flex row)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(
    () => [...highlights].sort((a, b) => a.pageYOffset - b.pageYOffset),
    [highlights],
  );

  // Resolve overlapping positions
  const positions = useMemo(() => {
    const CARD_HEIGHT = 90;
    const GAP = 8;
    const result: { highlight: Highlight; top: number }[] = [];

    for (const h of sorted) {
      let top = containerHeight > 0
        ? (h.pageYOffset / 100) * containerHeight
        : 0;

      // Push down if overlapping previous card
      for (const prev of result) {
        const prevBottom = prev.top + CARD_HEIGHT + GAP;
        if (top < prevBottom) {
          top = prevBottom;
        }
      }
      result.push({ highlight: h, top });
    }
    return result;
  }, [sorted, containerHeight]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '100%', width: '100%' }}
    >
      {positions.map(({ highlight: h, top }) => (
        <div
          key={h.id}
          style={{
            position: 'absolute',
            top,
            left: 0,
            right: 0,
            padding: '0 2px',
            transition: 'top 0.3s ease-out',
          }}
        >
          <AnnotationCard
            highlight={h}
            onUpdateNote={onUpdateNote}
            onDelete={onDelete}
          />
        </div>
      ))}
    </div>
  );
}
