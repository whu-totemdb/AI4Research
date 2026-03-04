import { useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Button, Space, Collapse, message } from 'antd';
import { SaveOutlined, ClearOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createNote } from '../api';

interface NoteEditorProps {
  paperId: number;
  selectedText: string;
  selectedPage: number | null;
  onNoteSaved: () => void;
  onClearSelection: () => void;
  matchedMarkdown?: string;
}

export default function NoteEditor({
  paperId,
  selectedText,
  selectedPage,
  onNoteSaved,
  onClearSelection,
  matchedMarkdown,
}: NoteEditorProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) {
      message.warning('Note content is empty');
      return;
    }
    setSaving(true);
    try {
      await createNote({
        paper_id: paperId,
        content: content.trim(),
        selected_text: selectedText,
        page_number: selectedPage,
      });
      message.success('Note saved');
      setContent('');
      onClearSelection();
      onNoteSaved();
    } catch {
      message.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {selectedText && (
        <div
          style={{
            padding: '8px 12px',
            background: '#e6f4ff',
            borderLeft: '3px solid #1a73e8',
            borderRadius: 4,
            fontSize: 13,
            color: '#333',
            position: 'relative',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4, color: '#1a73e8' }}>
            Selected text {selectedPage ? `(p.${selectedPage})` : ''}:
          </div>
          <div style={{ maxHeight: 80, overflow: 'auto' }}>{selectedText}</div>
          <ClearOutlined
            onClick={onClearSelection}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              cursor: 'pointer',
              color: '#999',
            }}
          />
        </div>
      )}
      {matchedMarkdown && (
        <Collapse
          size="small"
          items={[
            {
              key: 'matched',
              label: 'Matched MD Section',
              children: (
                <div style={{ fontSize: 13, maxHeight: 120, overflow: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{matchedMarkdown}</ReactMarkdown>
                </div>
              ),
            },
          ]}
        />
      )}
      <div data-color-mode="light">
        <MDEditor
          value={content}
          onChange={(v) => setContent(v || '')}
          height={200}
          preview="edit"
          visibleDragbar={false}
        />
      </div>
      <Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          size="small"
        >
          Save Note
        </Button>
      </Space>
    </div>
  );
}
