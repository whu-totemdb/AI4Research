import { useState, useEffect, useMemo } from 'react';
import { List, Typography, Popconfirm, Button, Empty, message, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, FileTextOutlined, MessageOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MDEditor from '@uiw/react-md-editor';
import type { Note } from '../types';
import { getNotes, updateNote, deleteNote } from '../api';

interface NotePanelProps {
  paperId: number;
  refreshKey: number;
  onPageClick?: (page: number) => void;
}

const { Text } = Typography;

function noteTypeIcon(noteType: string | undefined) {
  switch (noteType) {
    case 'claude_response':
      return <MessageOutlined style={{ color: '#722ed1', marginRight: 4 }} />;
    case 'summary':
      return <FileTextOutlined style={{ color: '#fa8c16', marginRight: 4 }} />;
    default:
      return <EditOutlined style={{ color: '#1a73e8', marginRight: 4 }} />;
  }
}

export default function NotePanel({ paperId, refreshKey, onPageClick }: NotePanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await getNotes(paperId);
      setNotes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [paperId, refreshKey]);

  const handleUpdate = async (id: number) => {
    try {
      await updateNote(id, { content: editContent });
      message.success('Note updated');
      setEditingId(null);
      loadNotes();
    } catch {
      message.error('Failed to update note');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNote(id);
      message.success('Note deleted');
      loadNotes();
    } catch {
      message.error('Failed to delete note');
    }
  };

  // Group notes by page number
  const groupedNotes = useMemo(() => {
    const groups = new Map<number | null, Note[]>();
    for (const note of notes) {
      const key = note.page_number;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(note);
    }
    // Sort: numbered pages first (ascending), then null
    const entries = [...groups.entries()].sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return a[0] - b[0];
    });
    return entries;
  }, [notes]);

  if (!loading && notes.length === 0) {
    return <Empty description="No notes yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const renderNote = (note: Note) => {
    // Extract title and content from note.content
    const lines = note.content.split('\n');
    const title = lines[0]?.startsWith('#') ? lines[0].replace(/^#+\s*/, '') : '';
    const content = title ? lines.slice(1).join('\n').trim() : note.content;

    return (
      <List.Item
        key={note.id}
        style={{
          display: 'block',
          padding: '12px 0',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        {/* First line: "笔记" Tag + quoted text preview (single line with ellipsis) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Tag color="blue" style={{ margin: 0, flexShrink: 0 }}>笔记</Tag>
          {note.selection_text && (
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              引用: {note.selection_text}
            </Text>
          )}
        </div>

        {/* Second line: Note title (if exists) */}
        {/* Third line: Note content */}
        {editingId === note.id ? (
          <div data-color-mode="light">
            <MDEditor
              value={editContent}
              onChange={(v) => setEditContent(v || '')}
              height={150}
              preview="edit"
              visibleDragbar={false}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Button size="small" type="primary" onClick={() => handleUpdate(note.id)}>
                Save
              </Button>
              <Button size="small" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {title && (
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#262626' }}>
                {title}
              </div>
            )}
            <div style={{ fontSize: 14, color: '#595959' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )}

        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {noteTypeIcon(note.note_type)}
            {new Date(note.created_at).toLocaleString()}
          </Text>
          <span>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingId(note.id);
                setEditContent(note.content);
              }}
            />
            <Popconfirm title="Delete this note?" onConfirm={() => handleDelete(note.id)}>
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </span>
        </div>
      </List.Item>
    );
  };

  return (
    <div style={{ padding: '0 12px' }}>
      <List loading={loading}>
        {groupedNotes.map(([page, pageNotes]) => (
          <div key={page ?? 'none'}>
            <div
              style={{
                padding: '6px 0',
                marginTop: 8,
                borderBottom: '1px solid #e8e8e8',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {page !== null ? (
                <Tag
                  color="blue"
                  style={{ cursor: onPageClick ? 'pointer' : 'default' }}
                  onClick={() => page !== null && onPageClick?.(page)}
                >
                  Page {page}
                </Tag>
              ) : (
                <Tag>No page</Tag>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {pageNotes.length} note{pageNotes.length > 1 ? 's' : ''}
              </Text>
            </div>
            {pageNotes.map(renderNote)}
          </div>
        ))}
      </List>
    </div>
  );
}
