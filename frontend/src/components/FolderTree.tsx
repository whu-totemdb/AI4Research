import { useState, useEffect, useMemo } from 'react';
import { Tree, Dropdown, Modal, Input, message, Button } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileUnknownOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import type { DataNode, TreeProps } from 'antd/es/tree';
import type { Folder, Paper } from '../types';
import { getFolders, createFolder, updateFolder, deleteFolder } from '../api';

interface FolderTreeProps {
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number | null) => void;
  papers?: Paper[];
  onOpenFolderProposal?: () => void;
  refreshKey?: number;
}

function buildTree(folders: Folder[], countMap: Map<number | string, number>, parentId: number | null = null): DataNode[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .map((f) => ({
      key: f.id,
      title: f.name,
      icon: ({ expanded }: { expanded?: boolean }) =>
        expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
      children: buildTree(folders, countMap, f.id),
      paperCount: countMap.get(f.id) ?? 0,
    }));
}

export default function FolderTree({ selectedFolderId, onSelectFolder, papers = [], onOpenFolderProposal, refreshKey }: FolderTreeProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['all']);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'rename'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [contextFolderId, setContextFolderId] = useState<number | null>(null);

  const loadFolders = async () => {
    try {
      const res = await getFolders();
      setFolders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFolders([]);
    }
  };

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (refreshKey !== undefined) {
      loadFolders();
    }
  }, [refreshKey]);

  useEffect(() => {
    const allKeys: React.Key[] = ['all', ...folders.map(f => f.id)];
    setExpandedKeys(allKeys);
  }, [folders]);

  // Compute paper counts per folder
  const countMap = useMemo(() => {
    const map = new Map<number | string, number>();
    for (const paper of papers) {
      // Use folders array from M2M relationship, fallback to folder_ids or folder_id
      let fids: number[] = [];
      if (paper.folders && paper.folders.length > 0) {
        fids = paper.folders.map(f => f.id);
      } else if (paper.folder_ids && paper.folder_ids.length > 0) {
        fids = paper.folder_ids;
      } else if (paper.folder_id) {
        fids = [paper.folder_id];
      }

      for (const fid of fids) {
        map.set(fid, (map.get(fid) || 0) + 1);
      }
      if (fids.length === 0) {
        map.set('uncategorized', (map.get('uncategorized') || 0) + 1);
      }
    }
    return map;
  }, [papers]);

  // Recursively count unique papers for parent folders (avoid double counting)
  const totalCountMap = useMemo(() => {
    const result = new Map<number | string, number>(countMap);

    // Build a map of folder -> unique paper IDs
    const folderPapers = new Map<number, Set<number>>();

    for (const paper of papers) {
      let fids: number[] = [];
      if (paper.folders && paper.folders.length > 0) {
        fids = paper.folders.map(f => f.id);
      } else if (paper.folder_ids && paper.folder_ids.length > 0) {
        fids = paper.folder_ids;
      } else if (paper.folder_id) {
        fids = [paper.folder_id];
      }

      for (const fid of fids) {
        if (!folderPapers.has(fid)) {
          folderPapers.set(fid, new Set());
        }
        folderPapers.get(fid)!.add(paper.id);
      }
    }

    // Recursively collect unique papers for each folder including children
    function getUniquePapers(folderId: number): Set<number> {
      const uniquePapers = new Set<number>(folderPapers.get(folderId) || []);

      for (const f of folders) {
        if (f.parent_id === folderId) {
          const childPapers = getUniquePapers(f.id);
          childPapers.forEach(paperId => uniquePapers.add(paperId));
        }
      }

      result.set(folderId, uniquePapers.size);
      return uniquePapers;
    }

    // Process root-level folders
    for (const f of folders) {
      if (f.parent_id === null) {
        getUniquePapers(f.id);
      }
    }

    return result;
  }, [countMap, folders, papers]);

  const treeData: DataNode[] = [
    {
      key: 'all',
      title: '全部论文',
      icon: <FolderOutlined />,
      children: buildTree(folders, totalCountMap),
      paperCount: papers.length,
    } as DataNode & { paperCount: number },
    {
      key: 'uncategorized',
      title: '未分类',
      icon: <FileUnknownOutlined />,
      paperCount: totalCountMap.get('uncategorized') ?? 0,
    } as DataNode & { paperCount: number },
  ];

  const onSelect: TreeProps['onSelect'] = (keys) => {
    if (keys.length === 0) return;
    const key = keys[0];
    if (key === 'all') {
      onSelectFolder(null);
    } else if (key === 'uncategorized') {
      onSelectFolder(-1);
    } else {
      onSelectFolder(key as number);
    }
  };

  const handleCreate = (parentId: number | null) => {
    setModalMode('create');
    setContextFolderId(parentId);
    setInputValue('');
    setModalOpen(true);
  };

  const handleRename = (id: number, name: string) => {
    setModalMode('rename');
    setEditingId(id);
    setInputValue(name);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '删除分类？',
      content: '将删除该分类及其所有子分类。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteFolder(id);
          message.success('分类已删除');
          loadFolders();
          if (selectedFolderId === id) onSelectFolder(null);
        } catch {
          message.error('删除分类失败');
        }
      },
    });
  };

  const handleModalOk = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入名称');
      return;
    }
    try {
      if (modalMode === 'create') {
        await createFolder({ name: inputValue.trim(), parent_id: contextFolderId });
        message.success('分类已创建');
      } else {
        await updateFolder(editingId!, { name: inputValue.trim() });
        message.success('分类已重命名');
      }
      setModalOpen(false);
      loadFolders();
    } catch {
      message.error(modalMode === 'create' ? '创建分类失败' : '重命名失败');
    }
  };

  const selectedKeys = selectedFolderId === null
    ? ['all']
    : selectedFolderId === -1
      ? ['uncategorized']
      : [selectedFolderId];

  const contextMenuItems = (nodeKey: string | number) => {
    const isRoot = nodeKey === 'all';
    const isUncategorized = nodeKey === 'uncategorized';
    if (isUncategorized) return [];
    const items = [
      {
        key: 'new',
        label: '新建子分类',
        icon: <PlusOutlined />,
        onClick: () => handleCreate(isRoot ? null : (nodeKey as number)),
      },
    ];
    if (!isRoot) {
      items.push(
        {
          key: 'rename',
          label: '重命名',
          icon: <EditOutlined />,
          onClick: () => {
            const f = folders.find((f) => f.id === nodeKey);
            if (f) handleRename(f.id, f.name);
          },
        },
        {
          key: 'delete',
          label: '删除',
          icon: <DeleteOutlined />,
          onClick: () => handleDelete(nodeKey as number),
        }
      );
    }
    return items;
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '4px 0' }}>
      <div
        style={{
          padding: '0 8px 6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>分类</span>
          {onOpenFolderProposal && (
            <Button
              type="link"
              size="small"
              icon={<ApartmentOutlined />}
              onClick={onOpenFolderProposal}
              style={{ padding: '0 2px', height: 'auto', fontSize: 11 }}
            >
              自动规划目录
            </Button>
          )}
        </div>
        <PlusOutlined
          style={{ cursor: 'pointer', color: '#1a73e8', fontSize: 12 }}
          onClick={() => handleCreate(selectedFolderId === -1 ? null : selectedFolderId)}
        />
      </div>
      <Tree
        showIcon
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys)}
        selectedKeys={selectedKeys}
        onSelect={onSelect}
        treeData={treeData}
        style={{ fontSize: 13 }}
        titleRender={(node) => {
          const count = (node as any).paperCount;
          return (
            <Dropdown
              menu={{ items: contextMenuItems(node.key as string | number) }}
              trigger={['contextMenu']}
            >
              <span style={{ fontSize: 13 }}>
                {node.title as string}
                {count !== undefined && (
                  <span style={{ color: '#999', fontSize: 11, marginLeft: 3 }}>({count})</span>
                )}
              </span>
            </Dropdown>
          );
        }}
      />
      <Modal
        title={modalMode === 'create' ? '新建分类' : '重命名分类'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        okText="确认"
        cancelText="取消"
      >
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="分类名称"
          onPressEnter={handleModalOk}
          autoFocus
        />
      </Modal>
    </div>
  );
}
