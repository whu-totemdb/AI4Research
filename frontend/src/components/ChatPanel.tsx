import { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Select, Spin, Tag } from 'antd';
import { SendOutlined, CloseOutlined, DownOutlined, PlusOutlined, FileTextOutlined, ToolOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ContextFileSelector from './ContextFileSelector';
import ToolSelector from './ToolSelector';
import './ChatPanel.css';
import { chatStream, chatWithTools, getAIProviders } from '../api';
import type { ChatMessage, AIProvider } from '../types';

interface ToolCall {
  tool: string;
  input: string;
  output?: string;
  status?: 'running' | 'success' | 'error';
}

interface ExtendedChatMessage extends ChatMessage {
  thinking?: string;
  toolCalls?: ToolCall[];
  isAgentMode?: boolean;
}

interface ChatPanelProps {
  paperId: number;
  selectedText: string | null;
  matchedMarkdown: string | null;
  contextFiles: string[];
  onContextFilesChange: (files: string[]) => void;
  onRefreshFiles?: () => void;
  notesRefreshKey?: number;
  onNoteSaved?: () => void;
  onClearSelection?: () => void;
  pageIndexExists?: boolean | null;
  pageIndexGenerating?: boolean;
  onGeneratePageIndex?: () => void;
  hasMarkdown?: boolean;
}

/** Parse raw streamed content, separating <think>...</think> and <tool>...</tool> blocks */
function parseAgentContent(raw: string): {
  thinking: string;
  answer: string;
  toolCalls: ToolCall[];
} {
  let thinking = '';
  let answer = '';
  const toolCalls: ToolCall[] = [];
  let remaining = raw;

  while (remaining.length > 0) {
    // Check for <think> blocks
    const thinkIdx = remaining.indexOf('<think>');
    const toolIdx = remaining.indexOf('<tool>');

    if (thinkIdx === -1 && toolIdx === -1) {
      answer += remaining;
      break;
    }

    // Process whichever comes first
    if (thinkIdx !== -1 && (toolIdx === -1 || thinkIdx < toolIdx)) {
      answer += remaining.slice(0, thinkIdx);
      remaining = remaining.slice(thinkIdx + 7);
      const closeIdx = remaining.indexOf('</think>');
      if (closeIdx === -1) {
        thinking += remaining;
        break;
      }
      thinking += remaining.slice(0, closeIdx);
      remaining = remaining.slice(closeIdx + 8);
    } else if (toolIdx !== -1) {
      answer += remaining.slice(0, toolIdx);
      remaining = remaining.slice(toolIdx + 6);
      const closeIdx = remaining.indexOf('</tool>');
      if (closeIdx === -1) break;

      const toolContent = remaining.slice(0, closeIdx);
      try {
        const toolData = JSON.parse(toolContent);
        toolCalls.push(toolData);
      } catch {
        // Invalid tool JSON, skip
      }
      remaining = remaining.slice(closeIdx + 7);
    }
  }

  return { thinking: thinking.trim(), answer, toolCalls };
}

/** Legacy parser for non-agent mode */
function parseThinkingContent(raw: string): { thinking: string; answer: string } {
  let thinking = '';
  let answer = '';
  let remaining = raw;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('<think>');
    if (openIdx === -1) {
      answer += remaining;
      break;
    }
    answer += remaining.slice(0, openIdx);
    remaining = remaining.slice(openIdx + 7);

    const closeIdx = remaining.indexOf('</think>');
    if (closeIdx === -1) {
      thinking += remaining;
      break;
    }
    thinking += remaining.slice(0, closeIdx);
    remaining = remaining.slice(closeIdx + 8);
  }

  return { thinking: thinking.trim(), answer };
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="chat-thinking-block" onClick={() => setExpanded(!expanded)}>
      <div className="chat-thinking-header">
        <span>🧠 思考过程</span>
        <DownOutlined className={`chat-thinking-toggle ${expanded ? 'expanded' : ''}`} />
      </div>
      {expanded && <div className="chat-thinking-body">{thinking}</div>}
    </div>
  );
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const getToolIcon = (tool: string) => {
    if (tool === 'pageindex') return '🔍';
    return '🔧';
  };

  const getToolName = (tool: string) => {
    if (tool === 'pageindex') return 'PageIndex 检索';
    return tool;
  };

  const getStatusIcon = (status?: string) => {
    if (status === 'running') return <Spin size="small" />;
    if (status === 'success') return '✓';
    if (status === 'error') return '✗';
    return null;
  };

  return (
    <div className="chat-tool-call-block" onClick={() => setExpanded(!expanded)}>
      <div className="chat-tool-call-header">
        <span>
          {getToolIcon(toolCall.tool)} {getToolName(toolCall.tool)}
        </span>
        <span className="chat-tool-call-status">
          {getStatusIcon(toolCall.status)}
        </span>
        <DownOutlined className={`chat-thinking-toggle ${expanded ? 'expanded' : ''}`} />
      </div>
      {expanded && (
        <div className="chat-tool-call-body">
          <div className="chat-tool-call-section">
            <strong>输入：</strong>
            <div className="chat-tool-call-content">{toolCall.input}</div>
          </div>
          {toolCall.output && (
            <div className="chat-tool-call-section">
              <strong>输出：</strong>
              <div className="chat-tool-call-content">{toolCall.output}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPanel({
  paperId,
  selectedText,
  matchedMarkdown,
  contextFiles,
  onContextFilesChange,
  onRefreshFiles,
  onClearSelection,
  pageIndexExists,
  pageIndexGenerating,
  onGeneratePageIndex,
  hasMarkdown,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [toolSelectorOpen, setToolSelectorOpen] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [maxTurns, setMaxTurns] = useState(5);
  const [inputExpanded, setInputExpanded] = useState(false);
  const rawContentRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevPaperId = useRef(paperId);

  // Load tool settings from localStorage
  useEffect(() => {
    const savedTools = localStorage.getItem(`paper_${paperId}_tools`);
    const savedMaxTurns = localStorage.getItem(`paper_${paperId}_maxTurns`);
    if (savedTools) {
      try {
        setSelectedTools(JSON.parse(savedTools));
      } catch {}
    }
    if (savedMaxTurns) {
      setMaxTurns(parseInt(savedMaxTurns, 10) || 5);
    }
  }, [paperId]);

  // Clear history when paperId changes
  useEffect(() => {
    if (paperId !== prevPaperId.current) {
      setMessages([]);
      prevPaperId.current = paperId;
    }
  }, [paperId]);

  // Load providers
  useEffect(() => {
    getAIProviders()
      .then((res) => {
        const list: AIProvider[] = (res.data as any) || [];
        setProviders(list);
        const def = list.find((p) => p.is_default);
        if (def) setProviderId(def.id);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll - only when streaming or messages change
  useEffect(() => {
    if (streaming && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, streaming]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming) return;

    const userMsg: ExtendedChatMessage = { role: 'user', content: question };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    rawContentRef.current = '';

    const assistantMsg: ExtendedChatMessage = {
      role: 'assistant',
      content: '',
      thinking: '',
      toolCalls: [],
      isAgentMode: selectedTools.length > 0,
    };
    setMessages([...history, assistantMsg]);

    const relativeContextFiles = contextFiles.map(path => {
      const prefix = `papers/${paperId}/`;
      return path.startsWith(prefix) ? path.slice(prefix.length) : path;
    });

    console.log('[ChatPanel] Original contextFiles:', contextFiles);
    console.log('[ChatPanel] Relative contextFiles:', relativeContextFiles);
    console.log('[ChatPanel] Agent mode enabled:', selectedTools.length > 0);
    console.log('[ChatPanel] Selected tools:', selectedTools);

    try {
      // Use Agent mode if tools are selected
      const streamFn = selectedTools.length > 0 ? chatWithTools : chatStream;
      const requestBody = selectedTools.length > 0
        ? {
            paper_id: paperId,
            question,
            selected_text: selectedText,
            matched_markdown: matchedMarkdown,
            context_files: relativeContextFiles,
            provider_id: providerId,
            history: messages,
            tools: selectedTools,
            max_turns: maxTurns,
          }
        : {
            paper_id: paperId,
            question,
            selected_text: selectedText,
            matched_markdown: matchedMarkdown,
            context_files: relativeContextFiles,
            provider_id: providerId,
            history: messages,
          };

      for await (const chunk of streamFn(requestBody as any)) {
        rawContentRef.current += chunk;

        // Use different parser based on mode
        if (selectedTools.length > 0) {
          const { thinking, answer, toolCalls } = parseAgentContent(rawContentRef.current);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: answer,
                thinking,
                toolCalls,
                isAgentMode: true,
              };
            }
            return updated;
          });
        } else {
          const { thinking, answer } = parseThinkingContent(rawContentRef.current);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: answer, thinking };
            }
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('[ChatPanel] Stream error:', error);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || '[请求失败，请检查网络连接或后端服务]',
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, paperId, selectedText, matchedMarkdown, contextFiles, providerId, selectedTools, maxTurns]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
  };

  const handleToolConfirm = (tools: string[], turns: number) => {
    setSelectedTools(tools);
    setMaxTurns(turns);
    // Save to localStorage
    localStorage.setItem(`paper_${paperId}_tools`, JSON.stringify(tools));
    localStorage.setItem(`paper_${paperId}_maxTurns`, turns.toString());
  };

  const removeSelectedTool = (toolId: string) => {
    const newTools = selectedTools.filter((t) => t !== toolId);
    setSelectedTools(newTools);
    localStorage.setItem(`paper_${paperId}_tools`, JSON.stringify(newTools));
  };

  const getToolName = (toolId: string) => {
    const toolNames: Record<string, string> = {
      pageindex: 'PageIndex 检索',
    };
    return toolNames[toolId] || toolId;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: '#fff' }}>
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <span style={{ fontSize: 32 }}>💬</span>
            <span>开始对话</span>
            <span style={{ fontSize: 12, color: '#d0d0d0' }}>选中 PDF 文本后可直接提问</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-msg-row ${msg.role === 'user' ? 'chat-msg-row-user' : 'chat-msg-row-ai'}`}
          >
            <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              {msg.role === 'assistant' && msg.isAgentMode && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#1677ff' }}>
                  🤖 Agent 模式
                </div>
              )}
              {msg.role === 'assistant' && msg.thinking && (
                <ThinkingBlock thinking={msg.thinking} />
              )}
              {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {msg.toolCalls.map((tc, idx) => (
                    <ToolCallBlock key={idx} toolCall={tc} />
                  ))}
                </div>
              )}
              {msg.role === 'user' ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              ) : (
                <div className="chat-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.content || (streaming && i === messages.length - 1 ? '...' : '')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && <Spin size="small" style={{ display: 'block', margin: '4px auto' }} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        {/* Selected text quote - at the top */}
        {selectedText && (
          <div className="chat-selection-quote">
            <div className="chat-selection-quote-text">
              {selectedText}
            </div>
            {onClearSelection && (
              <CloseOutlined className="chat-selection-quote-close" onClick={onClearSelection} />
            )}
          </div>
        )}

        {/* Context files tags - in the middle */}
        {contextFiles.length > 0 && (
          <div className="chat-context-files-tags">
            {contextFiles.map((file) => (
              <div key={file} className="chat-context-file-tag">
                <FileTextOutlined style={{ fontSize: 12 }} />
                <span>{file.split('/').pop()}</span>
                <CloseOutlined
                  style={{ fontSize: 10, cursor: 'pointer' }}
                  onClick={() => {
                    const newFiles = contextFiles.filter(f => f !== file);
                    onContextFilesChange(newFiles);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Selected tools tags */}
        {selectedTools.length > 0 && (
          <div className="chat-context-files-tags">
            {selectedTools.map((toolId) => (
              <Tag
                key={toolId}
                closable
                onClose={() => removeSelectedTool(toolId)}
                color="blue"
                style={{ margin: '2px 4px' }}
              >
                <ToolOutlined style={{ marginRight: 4 }} />
                {getToolName(toolId)}
              </Tag>
            ))}
          </div>
        )}

        {/* Control bar - Context button, Tools button, Model selector, New conversation button in one row */}
        <div className="chat-control-bar">
          <ContextFileSelector
            paperId={paperId}
            selectedFiles={contextFiles}
            onChange={onContextFilesChange}
          />
          <Button
            size="small"
            type="dashed"
            icon={<ToolOutlined />}
            onClick={() => setToolSelectorOpen(true)}
            style={{ fontSize: 12, height: 24, padding: '0 6px' }}
          >
            添加工具
          </Button>
          <Select
            size="small"
            placeholder="选择模型"
            value={providerId}
            onChange={setProviderId}
            className="chat-model-select"
            options={providers.map((p) => ({ label: p.name, value: p.id }))}
            allowClear
          />
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={handleNewConversation}
            disabled={streaming}
            className="chat-new-conversation-btn"
            title="开启新对话"
          >
            新对话
          </Button>
        </div>

        {/* Input row */}
        <div className="chat-input-row">
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题... (Ctrl+Enter 发送)"
            rows={inputExpanded ? 8 : 1}
            disabled={streaming}
            style={{ resize: 'none', borderRadius: 20, padding: '6px 16px', minHeight: 36, overflowY: 'auto' }}
          />
          <Button
            type="text"
            icon={inputExpanded ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={() => setInputExpanded(!inputExpanded)}
            style={{ flexShrink: 0 }}
            title={inputExpanded ? '收起输入框' : '展开输入框'}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="chat-send-btn"
          />
        </div>
      </div>

      {/* Tool Selector Drawer */}
      <ToolSelector
        paperId={paperId}
        open={toolSelectorOpen}
        onClose={() => setToolSelectorOpen(false)}
        selectedTools={selectedTools}
        maxTurns={maxTurns}
        onConfirm={handleToolConfirm}
        pageIndexExists={pageIndexExists}
        pageIndexGenerating={pageIndexGenerating}
        onGeneratePageIndex={onGeneratePageIndex}
        hasMarkdown={hasMarkdown}
      />
    </div>
  );
}
