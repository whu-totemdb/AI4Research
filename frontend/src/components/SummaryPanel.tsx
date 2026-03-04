import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Spin, Tooltip, message } from 'antd';
import { EditOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import './ChatPanel.css';

interface Props {
  paperId: number;
  onRefreshFiles?: () => void;
  notesRefreshKey?: number;
  onNoteSaved?: () => void;
}

const SummaryPanel: React.FC<Props> = ({ paperId, onRefreshFiles, notesRefreshKey, onNoteSaved }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load summary
  useEffect(() => {
    setLoading(true);
    fetch(`/api/papers/${paperId}/summary`)
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        if (data?.content) {
          setContent(data.content);
          setHasFile(true);
        } else {
          setContent('');
          setHasFile(false);
        }
      })
      .catch(() => { setContent(''); setHasFile(false); })
      .finally(() => setLoading(false));
  }, [paperId]);

  // Auto-save on edit
  const saveContent = useCallback((text: string) => {
    fetch(`/api/papers/${paperId}/summary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch(() => message.error('保存失败'));
  }, [paperId]);

  const handleContentChange = (text: string) => {
    setContent(text);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveContent(text), 1000);
  };

  // Generate/regenerate
  const handleGenerate = async () => {
    setGenerating(true);
    setContent('');
    setEditMode(false);
    try {
      const res = await fetch(`/api/papers/${paperId}/summary/generate`, { method: 'POST' });
      if (!res.ok || !res.body) throw new Error('生成失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                full += parsed.chunk;
                setContent(full);
              }
            } catch { /* skip */ }
          }
        }
      }
      setHasFile(true);
      // Trigger file list refresh after summary is generated
      if (onRefreshFiles) {
        onRefreshFiles();
      }
    } catch (e: any) {
      message.error(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div style={{ padding: 16, textAlign: 'center' }}><Spin /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid #f0f0f0' }}>
        {hasFile && (
          <Tooltip title={editMode ? '预览' : '编辑'}>
            <Button
              size="small"
              type="text"
              icon={editMode ? <EyeOutlined /> : <EditOutlined />}
              onClick={() => setEditMode(!editMode)}
            />
          </Tooltip>
        )}
        <Tooltip title={hasFile ? '重新生成' : '生成全文总结'}>
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined spin={generating} />}
            onClick={handleGenerate}
            disabled={generating}
          >
            {hasFile ? '重新生成' : '生成全文总结'}
          </Button>
        </Tooltip>
        {generating && <Spin size="small" />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px' }}>
        {!hasFile && !generating ? (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
            <p>暂无全文总结</p>
            <Button type="primary" onClick={handleGenerate}>生成全文总结</Button>
          </div>
        ) : editMode ? (
          <textarea
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.7,
              fontFamily: 'inherit',
              padding: 0,
            }}
          />
        ) : (
          <div className="chat-md" style={{ fontSize: 14, lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {content || ''}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPanel;
