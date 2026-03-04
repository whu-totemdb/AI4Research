import { useState, useEffect, useRef } from 'react';
import { CloseOutlined } from '@ant-design/icons';

interface ProgressItem {
  type: string;
  message?: string;
  tool?: string;
  query?: string;
  summary?: string;
}

interface MetadataProgressProps {
  visible: boolean;
  paperId: number | null;
  paperTitle: string;
  onClose: () => void;
  onComplete: (metadata: any) => void;
}

export default function MetadataProgress({
  visible,
  paperId,
  paperTitle,
  onClose,
  onComplete,
}: MetadataProgressProps) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible || paperId == null) return;
    setItems([]);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await fetch(`/api/papers/${paperId}/extract-metadata`, {
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          setItems((prev) => [...prev, { type: 'error', message: '请求失败: ' + response.status }]);
          return;
        }
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              setItems((prev) => [...prev, parsed]);
              if (parsed.type === 'result' && parsed.metadata) {
                onComplete(parsed.metadata);
              }
              if (parsed.type === 'done') {
                setTimeout(() => onClose(), 3000);
              }
            } catch { /* skip */ }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setItems((prev) => [...prev, { type: 'error', message: err.message || '连接失败' }]);
        }
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [visible, paperId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items]);

  if (!visible) return null;

  const renderItem = (item: ProgressItem, i: number) => {
    let text = '';
    switch (item.type) {
      case 'progress':
        text = `\u23F3 ${item.message || '处理中...'}`;
        break;
      case 'tool_call':
        text = `\uD83D\uDD0D 调用 ${item.tool}: ${item.query || ''}`;
        break;
      case 'tool_result':
        text = `\u2705 ${item.tool}: ${item.summary || '完成'}`;
        break;
      case 'result':
        text = '\uD83C\uDF89 提取完成';
        break;
      case 'error':
        text = `\u274C ${item.message || '发生错误'}`;
        break;
      default:
        text = item.message || JSON.stringify(item);
    }
    return (
      <div key={i} style={{ fontSize: 12, color: item.type === 'error' ? '#ff4d4f' : '#666', lineHeight: '22px' }}>
        {text}
      </div>
    );
  };

  const truncatedTitle = paperTitle.length > 30 ? paperTitle.slice(0, 30) + '...' : paperTitle;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 360,
        maxHeight: 300,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {'\uD83D\uDCCB'} 提取元信息 - {truncatedTitle}
        </span>
        <CloseOutlined
          style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}
          onClick={() => {
            abortRef.current?.abort();
            onClose();
          }}
        />
      </div>
      <div
        ref={listRef}
        style={{
          padding: '8px 14px',
          overflow: 'auto',
          flex: 1,
        }}
      >
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: '#999' }}>{'\u23F3'} 正在连接...</div>
        )}
        {items.map(renderItem)}
      </div>
    </div>
  );
}
