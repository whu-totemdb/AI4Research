import { useState, useCallback, useRef } from 'react';
import { Button, Space, Tag, Tooltip, Alert } from 'antd';
import {
  CodeOutlined,
  CloseOutlined,
  FileTextOutlined,
  LoadingOutlined,
  ReadOutlined,
  CloudOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import Terminal from './Terminal';
import TerminalRenderedView from './TerminalRenderedView';
import { getConnectionConfig } from '../services/claudeConnectionService';

export interface TerminalPanelProps {
  paperId?: number;
  paperTitle?: string;
  paperAbstract?: string;
  notes?: string;
  selectedText?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type ViewMode = 'terminal' | 'rendered' | 'split';

export default function TerminalPanel({
  paperId,
  paperTitle,
  paperAbstract,
  notes,
  selectedText,
}: TerminalPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [viewMode, setViewMode] = useState<ViewMode>('terminal');
  const [connectionMode, setConnectionMode] = useState<'docker' | 'local'>('local');
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);
  const outputBuffer = useRef('');
  const [outputSnapshot, setOutputSnapshot] = useState('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOutput = useCallback((data: string) => {
    outputBuffer.current += data;
    // Throttle state updates to avoid excessive re-renders
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        // Keep only last ~50KB to avoid memory issues
        if (outputBuffer.current.length > 50000) {
          outputBuffer.current = outputBuffer.current.slice(-50000);
        }
        setOutputSnapshot(outputBuffer.current);
        flushTimer.current = null;
      }, 300);
    }
  }, []);

  const startSession = useCallback(async () => {
    setStatus('connecting');
    outputBuffer.current = '';
    setOutputSnapshot('');
    setSecurityWarning(null);

    // Get current connection mode
    const config = getConnectionConfig();
    setConnectionMode(config.mode);

    try {
      const res = await fetch(`/api/terminal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paperId ? { paper_id: paperId } : {}),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      setSessionId(data.sessionId);
      setStatus('connected');

      // Show security warning for local mode
      if (data.mode === 'local' && data.securityWarning) {
        setSecurityWarning(data.securityWarning);
      }
    } catch {
      setStatus('disconnected');
    }
  }, [paperId]);

  const closeSession = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`/api/terminal/sessions/${sessionId}`, {
          method: 'DELETE',
        });
      } catch {
        // ignore
      }
    }
    setSessionId(null);
    setStatus('disconnected');
    setSecurityWarning(null);
    outputBuffer.current = '';
    setOutputSnapshot('');
  }, [sessionId]);

  const injectContext = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/terminal/sessions/${sessionId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperTitle || '',
          authors: '',
          abstract: paperAbstract || '',
          notes: notes || '',
          selectedText: selectedText || '',
        }),
      });
    } catch {
      // ignore
    }
  }, [sessionId, paperTitle, paperAbstract, notes, selectedText]);

  const handleDisconnect = useCallback(() => {
    setStatus('disconnected');
  }, []);

  const cycleViewMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === 'terminal') return 'split';
      if (prev === 'split') return 'rendered';
      return 'terminal';
    });
    // Flush current buffer when switching to rendered/split
    setOutputSnapshot(outputBuffer.current);
  }, []);

  const statusColor =
    status === 'connected'
      ? 'success'
      : status === 'connecting'
        ? 'processing'
        : 'default';

  const statusLabel =
    status === 'connected'
      ? '已连接'
      : status === 'connecting'
        ? '连接中'
        : '未连接';

  const viewModeLabel =
    viewMode === 'terminal'
      ? '终端'
      : viewMode === 'rendered'
        ? '渲染'
        : '分屏';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: '1px solid #303030',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#1e1e2e',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: '#181825',
          borderBottom: '1px solid #303030',
        }}
      >
        <Space size="small">
          <CodeOutlined style={{ color: '#89b4fa' }} />
          <span style={{ color: '#cdd6f4', fontSize: 13, fontWeight: 500 }}>
            Claude Code Terminal
          </span>
          <Tag color={statusColor}>{statusLabel}</Tag>
          {status === 'connected' && (
            <Tooltip title={connectionMode === 'docker' ? 'Docker 容器模式' : '本地模式'}>
              <Tag icon={connectionMode === 'docker' ? <CloudOutlined /> : <LaptopOutlined />} color={connectionMode === 'docker' ? 'blue' : 'orange'}>
                {connectionMode === 'docker' ? 'Docker' : 'Local'}
              </Tag>
            </Tooltip>
          )}
        </Space>

        <Space size="small">
          {status === 'connected' && (
            <Tooltip title={`切换视图模式 (当前: ${viewModeLabel})`}>
              <Button
                size="small"
                icon={<ReadOutlined />}
                onClick={cycleViewMode}
              >
                {viewModeLabel}
              </Button>
            </Tooltip>
          )}
          {status === 'disconnected' && (
            <Button
              type="primary"
              size="small"
              icon={<CodeOutlined />}
              onClick={startSession}
            >
              启动 Claude Code
            </Button>
          )}
          {status === 'connecting' && (
            <Button size="small" disabled icon={<LoadingOutlined />}>
              连接中...
            </Button>
          )}
          {status === 'connected' && (
            <>
              <Tooltip title="将当前论文信息注入终端上下文">
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={injectContext}
                  disabled={!paperId}
                >
                  注入上下文
                </Button>
              </Tooltip>
              <Tooltip title="关闭终端会话">
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={closeSession}
                >
                  关闭终端
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
      </div>

      {/* Security Warning */}
      {securityWarning && (
        <div style={{ padding: '8px 12px' }}>
          <Alert
            message="安全提示"
            description={securityWarning}
            type="warning"
            showIcon
            closable
            onClose={() => setSecurityWarning(null)}
            style={{ fontSize: 12 }}
          />
        </div>
      )}

      {/* Terminal + Rendered area */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {sessionId && status === 'connected' ? (
          <>
            {/* Terminal pane */}
            <div
              style={{
                flex: viewMode === 'rendered' ? 0 : 1,
                width: viewMode === 'rendered' ? 0 : undefined,
                overflow: 'hidden',
                display: viewMode === 'rendered' ? 'none' : 'block',
              }}
            >
              <Terminal
                sessionId={sessionId}
                onDisconnect={handleDisconnect}
                onOutput={handleOutput}
              />
            </div>
            {/* Rendered pane */}
            {viewMode !== 'terminal' && (
              <>
                {viewMode === 'split' && (
                  <div style={{ width: 1, background: '#303030', flexShrink: 0 }} />
                )}
                <div
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <TerminalRenderedView rawOutput={outputSnapshot} />
                </div>
              </>
            )}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              color: '#6c7086',
              fontSize: 14,
            }}
          >
            {status === 'connecting'
              ? '正在启动终端...'
              : '点击「启动 Claude Code」开始使用'}
          </div>
        )}
      </div>
    </div>
  );
}
