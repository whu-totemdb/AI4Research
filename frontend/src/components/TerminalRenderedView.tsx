import { useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface TerminalRenderedViewProps {
  rawOutput: string;
}

// Strip ANSI escape sequences and terminal control characters
function stripAnsi(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[?][0-9;]*[hlm]/g, '')
    .replace(/\x1b[()][A-Z0-9]/g, '')
    .replace(/\x1b[>=<]/g, '')
    .replace(/\x01[^\n]*/g, '')
    .replace(/\r+\n/g, '\n')
    .replace(/\r/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

// Remove terminal UI chrome (box drawing, decorative lines, prompt lines)
function removeTerminalChrome(text: string): string {
  const lines = text.split('\n');
  const filtered: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip lines that are purely box-drawing / decorative
    // Box drawing chars: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ╭ ╮ ╰ ╯ ▐ ▛ ▜ ▝ ▘ █ ═ ║
    if (/^[─│┌┐└┘├┤┬┴┼╭╮╰╯▐▛▜▝▘█═║░▒▓\s│|+\-=*]*$/.test(trimmed) && trimmed.length > 0) {
      continue;
    }

    // Skip Claude Code UI lines (welcome box, status lines)
    if (/^(Welcome|back!|Opus \d|API|Usage|Billing|D:\\|r…)$/.test(trimmed)) {
      continue;
    }

    // Skip prompt lines: ❯, ? for shortcuts, ────
    if (/^[❯>$#%]\s*$/.test(trimmed)) continue;
    if (/^\? for shortcuts/.test(trimmed)) continue;
    if (/^─{4,}/.test(trimmed)) continue;

    // Skip search/tool indicator lines
    if (/^● (Searched|Read|Listed|Wrote|Edited)/.test(trimmed)) continue;

    filtered.push(line);
  }

  return filtered.join('\n');
}

// Rejoin lines that were broken by terminal width wrapping
function unwrapLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    let current = lines[i];

    // Don't unwrap blank lines, headings, list items, code fences, block quotes
    const trimmed = current.trim();
    if (
      !trimmed ||
      /^#{1,6}\s/.test(trimmed) ||
      /^[-*+]\s/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed) ||
      /^```/.test(trimmed) ||
      /^>\s/.test(trimmed) ||
      /^\|/.test(trimmed) ||  // table rows
      /^[-:]+\|/.test(trimmed) // table separators
    ) {
      result.push(current);
      i++;
      continue;
    }

    // Try to join with following lines that look like continuations
    while (i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();

      // Stop joining at blank lines, headings, list items, code fences, etc.
      if (
        !nextTrimmed ||
        /^#{1,6}\s/.test(nextTrimmed) ||
        /^[-*+]\s/.test(nextTrimmed) ||
        /^\d+\.\s/.test(nextTrimmed) ||
        /^```/.test(nextTrimmed) ||
        /^>\s/.test(nextTrimmed) ||
        /^\|/.test(nextTrimmed) ||
        /^[-:]+\|/.test(nextTrimmed)
      ) {
        break;
      }

      // Join: if current line doesn't end with sentence-ending punctuation
      // or markdown structure, it was likely wrapped
      const currentEndsClean = /[.!?:;。！？：；)\]）】"']$/.test(current.trim());

      // If the current line ends cleanly AND the next line starts with a capital
      // or special char, it's probably a new sentence/paragraph
      if (currentEndsClean && /^[A-Z$#●❯>]/.test(nextTrimmed)) {
        break;
      }

      // Join the lines
      current = current.trimEnd() + ' ' + nextTrimmed;
      i++;
    }

    result.push(current);
    i++;
  }

  return result.join('\n');
}

// Fix LaTeX formulas that got split across lines
function fixBrokenFormulas(text: string): string {
  // Fix inline math $...$ split across lines
  // Find unclosed $ and join lines until closing $
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // Count unescaped $ signs (not $$)
    const dollars = line.match(/(?<!\$)\$(?!\$)/g);
    if (dollars && dollars.length % 2 !== 0) {
      // Odd number of $ — formula is split, join with next lines
      let joined = line;
      let j = i + 1;
      while (j < lines.length && j - i < 10) { // max 10 lines lookahead
        joined = joined.trimEnd() + ' ' + lines[j].trim();
        const allDollars = joined.match(/(?<!\$)\$(?!\$)/g);
        if (allDollars && allDollars.length % 2 === 0) {
          // Balanced now
          i = j;
          break;
        }
        j++;
      }
      result.push(joined);
    } else {
      result.push(line);
    }
    i++;
  }

  // Also fix $$ ... $$ display math split across lines
  let text2 = result.join('\n');
  text2 = text2.replace(/\$\$([^$]*?)\n([^$]*?)\$\$/g, (_, a, b) => {
    return '$$' + a.trim() + ' ' + b.trim() + '$$';
  });

  return text2;
}

// Main cleanup pipeline
function cleanOutput(raw: string): string {
  let text = stripAnsi(raw);
  text = removeTerminalChrome(text);
  text = unwrapLines(text);
  text = fixBrokenFormulas(text);

  // Collapse 3+ consecutive blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Keep last 500 lines
  const lines = text.split('\n');
  const trimmed = lines.length > 500 ? lines.slice(-500) : lines;

  return trimmed.join('\n').trim();
}

export default function TerminalRenderedView({ rawOutput }: TerminalRenderedViewProps) {
  const markdown = useMemo(() => cleanOutput(rawOutput), [rawOutput]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [markdown]);

  if (!markdown) {
    return (
      <div style={{ padding: 16, color: '#6c7086', textAlign: 'center' }}>
        终端暂无输出内容
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        padding: '12px 16px',
        overflowY: 'auto',
        height: '100%',
        background: '#1e1e2e',
        color: '#cdd6f4',
        fontSize: 14,
        lineHeight: 1.7,
      }}
      className="terminal-rendered-view"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
