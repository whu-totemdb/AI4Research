export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export const HIGHLIGHT_COLORS: Record<HighlightColor, { bg: string; border: string; label: string }> = {
  yellow: { bg: 'rgba(255,235,59,0.35)', border: '#f9a825', label: '重点' },
  green:  { bg: 'rgba(76,175,80,0.30)',  border: '#388e3c', label: '理解' },
  blue:   { bg: 'rgba(33,150,243,0.30)', border: '#1565c0', label: '疑问' },
  pink:   { bg: 'rgba(233,30,99,0.25)',  border: '#c2185b', label: '关键' },
  purple: { bg: 'rgba(156,39,176,0.25)', border: '#7b1fa2', label: '笔记' },
};

export interface HighlightRect {
  x: number;  // % of page width (0-100)
  y: number;  // % of page height (0-100)
  w: number;  // % of page width
  h: number;  // % of page height
}

export interface Highlight {
  id: string;
  paperId: number;
  text: string;
  note: string;
  title?: string;
  color: HighlightColor;
  page: number;           // 1-based
  rects: HighlightRect[];
  pageYOffset: number;    // Y% of first rect in page (for annotation alignment)
  createdAt: string;
}
