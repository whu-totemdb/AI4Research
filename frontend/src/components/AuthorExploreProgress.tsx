import { useEffect, useRef } from 'react';
import { CloseOutlined, TeamOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

export interface AuthorActivity {
  type: string;
  author: string;
  tool?: string;
  query?: string;
  summary?: string;
  message?: string;
}

interface AuthorExploreProgressProps {
  visible: boolean;
  paperTitle: string;
  currentAuthor: string;
  completedCount: number;
  totalCount: number;
  status: 'exploring' | 'complete' | 'error';
  errorMessage?: string;
  activities?: AuthorActivity[];
  onClose: () => void;
}

function renderActivity(act: AuthorActivity, idx: number) {
  const style = { fontSize: 11, color: '#666', lineHeight: '18px', padding: '2px 0' } as const;
  if (act.type === 'tool_call') {
    return <div key={idx} style={style}>🔍 [{act.author}] 调用 {act.tool}: {act.query}</div>;
  }
  if (act.type === 'tool_result') {
    return <div key={idx} style={style}>✅ [{act.author}] {act.tool} 返回: {act.summary}</div>;
  }
  if (act.type === 'thinking') {
    const msg = act.message && act.message.length > 100 ? act.message.slice(0, 100) + '...' : act.message;
    return <div key={idx} style={style}>💭 [{act.author}] {msg}</div>;
  }
  return null;
}

export default function AuthorExploreProgress({
  visible,
  paperTitle,
  currentAuthor,
  completedCount,
  totalCount,
  status,
  errorMessage,
  activities = [],
  onClose,
}: AuthorExploreProgressProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activities.length]);

  if (!visible) return null;

  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const truncatedTitle = paperTitle.length > 30 ? paperTitle.slice(0, 30) + '...' : paperTitle;

  const statusIcon =
    status === 'complete' ? <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} /> :
    status === 'error' ? <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 4 }} /> :
    null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 360,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
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
          <TeamOutlined style={{ marginRight: 6 }} />
          {status === 'complete' ? '作者探索完成' : '作者探索'} - {truncatedTitle}
        </span>
        <CloseOutlined
          style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}
          onClick={onClose}
        />
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px' }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: '#f0f0f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percent}%`,
                borderRadius: 3,
                background: status === 'error' ? '#ff4d4f' : status === 'complete' ? '#52c41a' : '#1677ff',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#999' }}>
              {completedCount}/{totalCount} 位作者
            </span>
            <span style={{ fontSize: 11, color: '#999' }}>{percent}%</span>
          </div>
        </div>

        {/* Current status */}
        <div style={{ fontSize: 12, color: status === 'error' ? '#ff4d4f' : '#666', lineHeight: '20px' }}>
          {statusIcon}
          {status === 'error' ? (errorMessage || '发生错误') : currentAuthor}
        </div>

        {/* Activity log */}
        {activities.length > 0 && (
          <div
            ref={logRef}
            style={{
              marginTop: 8,
              maxHeight: 200,
              overflowY: 'auto',
              borderTop: '1px solid #f0f0f0',
              paddingTop: 6,
            }}
          >
            {activities.map((act, idx) => renderActivity(act, idx))}
          </div>
        )}
      </div>
    </div>
  );
}
