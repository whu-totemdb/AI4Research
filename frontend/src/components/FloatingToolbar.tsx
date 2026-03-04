import { createPortal } from 'react-dom';
import { Button, Tooltip } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../types/annotation';

interface FloatingToolbarProps {
  visible: boolean;
  x: number;
  y: number;
  onPickColor: (color: HighlightColor) => void;
  onAskAI: () => void;
}

export default function FloatingToolbar({ visible, x, y, onPickColor, onAskAI }: FloatingToolbarProps) {
  if (!visible) return null;

  const clampedX = Math.min(x, window.innerWidth - 260);
  const clampedY = Math.max(y, 10);

  return createPortal(
    <div
      data-floating-toolbar
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 9999,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {(Object.entries(HIGHLIGHT_COLORS) as [HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]][]).map(([color, config]) => (
        <Tooltip key={color} title={config.label}>
          <div
            onClick={() => onPickColor(color)}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: config.bg.replace(/[\d.]+\)$/, '0.7)'),
              border: `2px solid ${config.border}`,
              cursor: 'pointer',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        </Tooltip>
      ))}
      <div style={{ width: 1, height: 20, background: '#e0e0e0', margin: '0 4px' }} />
      <Tooltip title="问 AI">
        <Button size="small" type="text" icon={<RobotOutlined />} onClick={onAskAI} />
      </Tooltip>
    </div>,
    document.body,
  );
}
