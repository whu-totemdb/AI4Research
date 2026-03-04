import { useState, useRef, useEffect } from 'react';
import { Button, Spin, Tooltip } from 'antd';
import { CloseOutlined, CopyOutlined, FontSizeOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './TranslationPopup.css';

interface TranslationPopupProps {
  translation: string;
  loading: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

type FontSize = 'small' | 'medium' | 'large';

const FONT_SIZE_MAP: Record<FontSize, number> = {
  small: 12,
  medium: 14,
  large: 16,
};

export default function TranslationPopup({
  translation,
  loading,
  position,
  onClose,
}: TranslationPopupProps) {
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [currentPos, setCurrentPos] = useState(position);
  const [size, setSize] = useState({ width: 320, height: 200 });
  const [hasUserMoved, setHasUserMoved] = useState(false); // Track if user has manually moved the popup
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeStartRef = useRef({ width: 0, height: 0, startX: 0, startY: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  // Constrain position to viewport bounds
  const constrainPosition = (pos: { x: number; y: number }, popupWidth: number, popupHeight: number) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 20; // Minimum distance from viewport edge

    return {
      x: Math.max(padding, Math.min(pos.x, viewportWidth - popupWidth - padding)),
      y: Math.max(padding, Math.min(pos.y, viewportHeight - popupHeight - padding)),
    };
  };

  // Update position when prop changes, but only if user hasn't manually moved it
  useEffect(() => {
    if (!hasUserMoved) {
      const constrained = constrainPosition(position, size.width, size.height);
      setCurrentPos(constrained);
    }
  }, [position, hasUserMoved, size.width, size.height]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.translation-popup-header')) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: currentPos.x,
        startY: currentPos.y,
      };
      e.preventDefault();
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    resizeStartRef.current = {
      width: size.width,
      height: size.height,
      startX: e.clientX,
      startY: e.clientY,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        const newPos = {
          x: dragStartRef.current.startX + deltaX,
          y: dragStartRef.current.startY + deltaY,
        };
        // Constrain position while dragging
        const constrained = constrainPosition(newPos, size.width, size.height);
        setCurrentPos(constrained);
        setHasUserMoved(true); // Mark that user has manually moved the popup
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.startX;
        const deltaY = e.clientY - resizeStartRef.current.startY;
        setSize({
          width: Math.max(280, resizeStartRef.current.width + deltaX),
          height: Math.max(150, resizeStartRef.current.height + deltaY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, size.width, size.height]);

  const handleCopy = () => {
    navigator.clipboard.writeText(translation);
  };

  const handleClose = () => {
    // Reset hasUserMoved flag when closing, so next time it opens at selection position
    setHasUserMoved(false);
    onClose();
  };

  const cycleFontSize = () => {
    const sizes: FontSize[] = ['small', 'medium', 'large'];
    const currentIndex = sizes.indexOf(fontSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    setFontSize(sizes[nextIndex]);
  };

  return (
    <div
      ref={popupRef}
      className="translation-popup"
      style={{
        left: currentPos.x,
        top: currentPos.y,
        width: size.width,
        height: size.height,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="translation-popup-header">
        <span className="translation-popup-title">翻译</span>
        <div className="translation-popup-actions">
          <Tooltip title={`字体大小: ${fontSize === 'small' ? '小' : fontSize === 'medium' ? '中' : '大'}`}>
            <Button
              type="text"
              size="small"
              icon={<FontSizeOutlined />}
              onClick={cycleFontSize}
              className="translation-popup-btn"
            />
          </Tooltip>
          {translation && !loading && (
            <Tooltip title="复制翻译">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopy}
                className="translation-popup-btn"
              />
            </Tooltip>
          )}
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={handleClose}
            className="translation-popup-btn"
          />
        </div>
      </div>
      <div className="translation-popup-content" style={{ fontSize: FONT_SIZE_MAP[fontSize] }}>
        {loading && !translation ? (
          <div className="translation-popup-loading">
            <Spin size="small" />
            <span>翻译中...</span>
          </div>
        ) : (
          <div className="translation-popup-text">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {translation || '暂无翻译'}
            </ReactMarkdown>
          </div>
        )}
      </div>
      <div
        className="translation-popup-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}
