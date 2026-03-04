import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CloseOutlined } from '@ant-design/icons';
import 'katex/dist/katex.min.css';
import '../styles/markdown-sidebar.css';

interface MarkdownSidebarProps {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  title?: string;
  width?: string;
}

/**
 * Markdown Sidebar Component
 *
 * A reusable sidebar component that slides in from the right side of the screen
 * to display markdown content. The main content area automatically shrinks to
 * accommodate the sidebar, creating a split-screen effect.
 *
 * @example
 * ```tsx
 * import MarkdownSidebar from './components/MarkdownSidebar';
 * import { useMarkdownSidebar } from './hooks/useMarkdownSidebar';
 *
 * function MyComponent() {
 *   const sidebar = useMarkdownSidebar();
 *
 *   return (
 *     <>
 *       <button onClick={() => sidebar.open('# Hello\nMarkdown content', 'My Doc')}>
 *         Open Sidebar
 *       </button>
 *       <MarkdownSidebar
 *         isOpen={sidebar.isOpen}
 *         content={sidebar.content}
 *         title={sidebar.title}
 *         onClose={sidebar.close}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export default function MarkdownSidebar({
  isOpen,
  content,
  onClose,
  title = 'Markdown 文档',
  width = '45%',
}: MarkdownSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen, content]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`markdown-sidebar-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`markdown-sidebar-container ${isOpen ? 'open' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div className="markdown-sidebar-header">
          <h2 className="markdown-sidebar-title">{title}</h2>
          <button
            onClick={onClose}
            className="markdown-sidebar-close"
            aria-label="关闭侧边栏"
          >
            <CloseOutlined />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="markdown-sidebar-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              a: ({ node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </>
  );
}
