import { useState } from 'react';
import { Button, Input, message, Spin } from 'antd';
import { SearchOutlined, SendOutlined, SaveOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { matchText, askClaude, createNote } from '../api';
import type { MatchResult } from '../types';

interface AskClaudePanelProps {
  paperId: number;
  selectedText: string;
  selectedPage: number | null;
  onNoteSaved: () => void;
}

export default function AskClaudePanel({
  paperId,
  selectedText,
  selectedPage,
  onNoteSaved,
}: AskClaudePanelProps) {
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleMatch = async () => {
    if (!selectedText) {
      message.warning('No text selected');
      return;
    }
    setMatchLoading(true);
    try {
      const res = await matchText(paperId, selectedText);
      setMatchResult(res.data as MatchResult);
    } catch {
      message.error('Match failed');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) {
      message.warning('Please enter a question');
      return;
    }
    setAnswer('');
    setStreaming(true);
    try {
      const stream = askClaude(paperId, {
        selected_text: selectedText,
        question: question.trim(),
        matched_markdown: matchResult?.matched_section || null,
      });
      let accumulated = '';
      for await (const chunk of stream) {
        if (typeof chunk === 'string') {
          accumulated += chunk;
          setAnswer(accumulated);
        }
      }
    } catch {
      message.error('Failed to get response from Claude');
    } finally {
      setStreaming(false);
    }
  };

  const handleSaveAsNote = async () => {
    if (!answer.trim()) return;
    setSaving(true);
    try {
      await createNote({
        paper_id: paperId,
        content: answer.trim(),
        selected_text: selectedText,
        page_number: selectedPage,
      });
      message.success('Saved as note');
      onNoteSaved();
    } catch {
      message.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      {/* Selected text display */}
      {selectedText && (
        <div
          style={{
            padding: '8px 12px',
            background: '#e6f4ff',
            borderLeft: '3px solid #1a73e8',
            borderRadius: 4,
            fontSize: 13,
            color: '#333',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4, color: '#1a73e8' }}>
            Selected text {selectedPage ? `(p.${selectedPage})` : ''}:
          </div>
          <div style={{ maxHeight: 80, overflow: 'auto' }}>{selectedText}</div>
        </div>
      )}

      {/* Match MD button */}
      <Button
        size="small"
        icon={<SearchOutlined />}
        onClick={handleMatch}
        loading={matchLoading}
        disabled={!selectedText}
      >
        Match MD
      </Button>

      {/* Match result */}
      {matchResult && matchResult.matched_section && (
        <div
          style={{
            padding: '8px 12px',
            background: '#f6f8fa',
            borderRadius: 4,
            fontSize: 13,
            maxHeight: 150,
            overflow: 'auto',
            border: '1px solid #e8e8e8',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4, color: '#666', fontSize: 12 }}>
            Matched section (confidence: {Math.round(matchResult.confidence * 100)}%)
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {matchResult.matched_section}
          </ReactMarkdown>
        </div>
      )}

      {/* Question input */}
      <Input.TextArea
        placeholder="Enter your question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        onPressEnter={(e) => {
          if (e.ctrlKey) handleAsk();
        }}
      />

      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleAsk}
        loading={streaming}
        disabled={!question.trim()}
        size="small"
      >
        Ask Claude
      </Button>

      {/* Claude's response */}
      {(answer || streaming) && (
        <div
          style={{
            padding: '10px 12px',
            background: '#fafafa',
            borderRadius: 4,
            border: '1px solid #e8e8e8',
            fontSize: 14,
            maxHeight: 300,
            overflow: 'auto',
          }}
        >
          {streaming && !answer && <Spin size="small" />}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      )}

      {/* Save as note */}
      {answer && !streaming && (
        <Button
          size="small"
          icon={<SaveOutlined />}
          onClick={handleSaveAsNote}
          loading={saving}
        >
          Save as Note
        </Button>
      )}
    </div>
  );
}
