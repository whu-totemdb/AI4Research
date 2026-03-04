import { useState, useEffect, useMemo } from 'react';
import { Tree, Typography, Spin, Empty, Button, message } from 'antd';
import {
  FilePdfOutlined,
  FileMarkdownOutlined,
  FileImageOutlined,
  FileOutlined,
  FolderOutlined,
  SyncOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import { getPaperFiles, convertPdfToMd } from '../api';
import type { PaperFile } from '../types';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface PaperFileExplorerProps {
  paperId: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
  if (lower.endsWith('.md')) return <FileMarkdownOutlined style={{ color: '#1890ff' }} />;
  if (/\.(png|jpe?g|gif|svg|bmp|webp)$/i.test(lower)) return <FileImageOutlined style={{ color: '#52c41a' }} />;
  return <FileOutlined />;
}

interface TreeDir {
  children: Map<string, TreeDir>;
  files: PaperFile[];
}

function buildTree(files: PaperFile[]): DataNode[] {
  const root: TreeDir = { children: new Map(), files: [] };

  for (const file of files) {
    const parts = file.name.replace(/\\/g, '/').split('/');
    if (parts.length === 1) {
      root.files.push(file);
    } else {
      let current = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts[i];
        if (!current.children.has(dir)) {
          current.children.set(dir, { children: new Map(), files: [] });
        }
        current = current.children.get(dir)!;
      }
      current.files.push({ ...file, name: parts[parts.length - 1] });
    }
  }

  function toNodes(dir: TreeDir, prefix: string): DataNode[] {
    const nodes: DataNode[] = [];

    // Directories first, sorted
    const sortedDirs = [...dir.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, child] of sortedDirs) {
      const key = prefix ? `${prefix}/${name}` : name;
      nodes.push({
        key,
        title: name,
        icon: <FolderOutlined style={{ color: '#faad14' }} />,
        children: toNodes(child, key),
        selectable: false,
      });
    }

    // Files sorted: pdf first, then md, then rest
    const sortedFiles = [...dir.files].sort((a, b) => {
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      const aPdf = al.endsWith('.pdf');
      const bPdf = bl.endsWith('.pdf');
      if (aPdf !== bPdf) return aPdf ? -1 : 1;
      const aMd = al.endsWith('.md');
      const bMd = bl.endsWith('.md');
      if (aMd !== bMd) return aMd ? -1 : 1;
      return al.localeCompare(bl);
    });

    for (const file of sortedFiles) {
      const key = prefix ? `${prefix}/${file.name}` : file.name;
      nodes.push({
        key,
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{file.name}</span>
            <Text type="secondary" style={{ fontSize: 11 }}>{formatSize(file.size)}</Text>
          </span>
        ),
        icon: getFileIcon(file.name),
        isLeaf: true,
      });
    }

    return nodes;
  }

  return toNodes(root, '');
}

export default function PaperFileExplorer({ paperId }: PaperFileExplorerProps) {
  const [files, setFiles] = useState<PaperFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

  const fetchFiles = (id: number) => {
    setLoading(true);
    getPaperFiles(id)
      .then((res) => {
        const filesData = res.data?.files || res.data;
        setFiles(Array.isArray(filesData) ? filesData : []);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPaperFiles(paperId)
      .then((res) => {
        if (!cancelled) {
          const filesData = res.data?.files || res.data;
          setFiles(Array.isArray(filesData) ? filesData : []);
        }
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Listen for refresh events
    const handleRefresh = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.paperId === paperId) {
        fetchFiles(paperId);
      }
    };

    window.addEventListener('refreshPaperFiles', handleRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('refreshPaperFiles', handleRefresh);
    };
  }, [paperId]);

  const treeData = useMemo(() => buildTree(files), [files]);
  const hasMd = useMemo(() => files.some((f) => f.name.toLowerCase().endsWith('.md')), [files]);

  // Collect all directory keys for default expansion
  const dirKeys = useMemo(() => {
    const keys: string[] = [];
    function collect(nodes: DataNode[]) {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          keys.push(String(n.key));
          collect(n.children);
        }
      }
    }
    collect(treeData);
    return keys;
  }, [treeData]);

  const handleConvert = async () => {
    setConverting(true);
    try {
      await convertPdfToMd(paperId);
      message.success('转换已提交，请稍后刷新查看');
    } catch {
      message.error('转换请求失败');
    } finally {
      setConverting(false);
    }
  };

  const handleSelect = (_: React.Key[], info: { node: DataNode }) => {
    const node = info.node;
    if (!node.isLeaf) return;
    const key = String(node.key);
    const fileName = key.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      window.open(`/api/papers/${paperId}/file`, '_blank');
    } else if (fileName.endsWith('.md') || fileName.endsWith('.txt') || fileName.endsWith('.jsonl')) {
      // For text-based files, construct the URL and open in new tab
      const file = files.find(f => f.path === key);
      if (file) {
        window.open(`http://localhost:8000/papers/${paperId}/${file.path}`, '_blank');
      }
    }
  };

  if (loading) return <Spin size="small" style={{ padding: 16 }} />;
  if (files.length === 0) return <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>文件目录</span>
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              onClick={() => fetchFiles(paperId)}
              style={{ padding: '0 4px', height: 'auto' }}
            />
          </div>
          {!hasMd && (
            <Button
              size="small"
              type="primary"
              icon={<FileAddOutlined />}
              loading={converting}
              onClick={handleConvert}
              style={{ borderRadius: 4 }}
            >
              转换MD
            </Button>
          )}
        </div>
        <Tree
          showIcon
          defaultExpandedKeys={[]}
          treeData={treeData}
          onSelect={handleSelect as any}
          style={{ padding: '0 8px 8px' }}
        />
      </div>
    </div>
  );
}
