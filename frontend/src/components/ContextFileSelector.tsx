import { useState, useEffect } from 'react';
import { Popover, Checkbox, Button, Empty, Spin, Tag } from 'antd';
import { PlusOutlined, FileMarkdownOutlined, FileTextOutlined, FilePdfOutlined, CloseOutlined } from '@ant-design/icons';
import { getPaperFiles } from '../api';
import type { PaperFile } from '../types';

interface ContextFileSelectorProps {
  paperId: number;
  selectedFiles: string[];
  onChange: (files: string[]) => void;
}

function fileIcon(name: string) {
  if (name.endsWith('.md')) return <FileMarkdownOutlined style={{ color: '#1677ff' }} />;
  if (name.endsWith('.txt')) return <FileTextOutlined style={{ color: '#52c41a' }} />;
  if (name.endsWith('.jsonl')) return <FileTextOutlined style={{ color: '#722ed1' }} />;
  return <FilePdfOutlined style={{ color: '#fa8c16' }} />;
}

function fileTypeLabel(name: string) {
  if (name.endsWith('.md')) return 'Markdown';
  if (name.endsWith('.txt')) return 'Text';
  if (name.endsWith('.jsonl')) return 'JSONL';
  return 'Other';
}

function groupByType(files: PaperFile[]) {
  const groups: Record<string, PaperFile[]> = {};
  for (const f of files) {
    const label = fileTypeLabel(f.name);
    if (!groups[label]) groups[label] = [];
    groups[label].push(f);
  }
  return groups;
}

export default function ContextFileSelector({ paperId, selectedFiles, onChange }: ContextFileSelectorProps) {
  const [files, setFiles] = useState<PaperFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPaperFiles(paperId)
      .then((res) => {
        const response = res.data as any;
        const all: PaperFile[] = response.files || [];
        const filtered = all.filter((f) => f.name.endsWith('.md') || f.name.endsWith('.txt') || f.name.endsWith('.jsonl'));
        console.log('[ContextFileSelector] All files:', all);
        console.log('[ContextFileSelector] Filtered files:', filtered);
        setFiles(filtered);
      })
      .catch((err) => {
        console.error('[ContextFileSelector] Failed to load files:', err);
        setFiles([]);
      })
      .finally(() => setLoading(false));
  }, [paperId, open]);

  const removeFile = (path: string) => {
    onChange(selectedFiles.filter((f) => f !== path));
  };

  const fileNameFromPath = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  };

  const grouped = groupByType(files);

  const content = loading ? (
    <div style={{ padding: 12, textAlign: 'center' }}><Spin size="small" /></div>
  ) : files.length === 0 ? (
    <Empty description="暂无可用文件" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
  ) : (
    <div style={{ maxHeight: 260, overflow: 'auto', minWidth: 220 }}>
      <Checkbox.Group
        value={selectedFiles}
        onChange={(vals) => onChange(vals as string[])}
        style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {Object.entries(grouped).map(([label, groupFiles]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: '#999', padding: '6px 4px 2px', fontWeight: 500 }}>{label}</div>
            {groupFiles.map((f) => (
              <Checkbox key={f.path} value={f.path} style={{ marginLeft: 0, padding: '3px 4px', width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  {fileIcon(f.name)} {f.name}
                </span>
              </Checkbox>
            ))}
          </div>
        ))}
      </Checkbox.Group>
    </div>
  );

  return (
    <Popover
      content={content}
      title={<span style={{ fontSize: 13 }}>选择上下文文件</span>}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="topLeft"
    >
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        style={{ fontSize: 12, height: 24, padding: '0 6px' }}
      >
        上下文
      </Button>
    </Popover>
  );
}
