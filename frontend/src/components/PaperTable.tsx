import { useState, useEffect } from 'react';
import {
  Table, Button, Tag, Popconfirm, message, Modal, TreeSelect, Space,
  Typography, Empty, Dropdown, Form, Input, Popover, Checkbox, Rate, Progress, notification,
} from 'antd';
import {
  DeleteOutlined, FolderOutlined, SearchOutlined, EllipsisOutlined,
  EditOutlined, SettingOutlined, TeamOutlined, RobotOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type { Paper, Folder } from '../types';
import type { AuthorInfo } from '../types';
import { deletePaper, setPaperFolders, updatePaper, updateImportance, getAuthorInfos, classifyPaper, classifyPapersBatch } from '../api';
import PaperFileExplorer from './PaperFileExplorer';
import AuthorPopover from './AuthorPopover';
import AuthorExploreProgress from './AuthorExploreProgress';
import type { AuthorActivity } from './AuthorExploreProgress';

const { Text } = Typography;

const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'geekblue', 'volcano', 'gold', 'lime'];

interface PaperTableProps {
  papers: Paper[];
  loading: boolean;
  onRefresh: () => void;
  folders: Folder[];
  onExtractMetadata?: (paper: Paper) => void;
}

function buildTreeSelectData(folders: Folder[], parentId: number | null = null): any[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .map((f) => ({
      title: f.name,
      value: f.id,
      key: f.id,
      children: buildTreeSelectData(folders, f.id),
    }));
}

interface ColumnVisibility {
  authors: boolean;
  venue: boolean;
  publish_date: boolean;
  created_at: boolean;
}

const defaultVisibility: ColumnVisibility = {
  authors: true,
  venue: true,
  publish_date: true,
  created_at: true,
};

export default function PaperTable({ papers, loading, onRefresh, folders, onExtractMetadata }: PaperTableProps) {
  const navigate = useNavigate();
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalPaper, setFolderModalPaper] = useState<Paper | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]);
  const [savingFolders, setSavingFolders] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<number>>(new Set());

  // Edit metadata modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalPaper, setEditModalPaper] = useState<Paper | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(defaultVisibility);

  // Row selection for batch operations
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [checkboxVisible, setCheckboxVisible] = useState(false);

  // Batch classify state
  const [batchClassifyOpen, setBatchClassifyOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: { paper_id: number; title?: string; folders?: string[]; error?: string }[] }>({ current: 0, total: 0, results: [] });
  const [batchRunning, setBatchRunning] = useState(false);

  // Single classify loading
  const [classifyingIds, setClassifyingIds] = useState<Set<number>>(new Set());

  // Author exploration state
  const [authorInfoMap, setAuthorInfoMap] = useState<Record<number, AuthorInfo[]>>({});
  const [authorExploreState, setAuthorExploreState] = useState<{
    visible: boolean;
    paperTitle: string;
    currentAuthor: string;
    completedCount: number;
    totalCount: number;
    status: 'exploring' | 'complete' | 'error';
    errorMessage?: string;
    activities: AuthorActivity[];
  }>({
    visible: false,
    paperTitle: '',
    currentAuthor: '',
    completedCount: 0,
    totalCount: 0,
    status: 'exploring',
    activities: [],
  });

  const handleDelete = async (id: number) => {
    try {
      await deletePaper(id);
      message.success('论文已删除');
      onRefresh();
    } catch {
      message.error('删除失败');
    }
  };

  const openFolderModal = (paper: Paper) => {
    setFolderModalPaper(paper);
    setSelectedFolderIds(paper.folder_ids || (paper.folder_id ? [paper.folder_id] : []));
    setFolderModalOpen(true);
  };

  const handleSaveFolders = async () => {
    if (!folderModalPaper) return;
    setSavingFolders(true);
    try {
      await setPaperFolders(folderModalPaper.id, selectedFolderIds);
      message.success('分类已更新');
      setFolderModalOpen(false);
      onRefresh();
    } catch {
      message.error('更新分类失败');
    } finally {
      setSavingFolders(false);
    }
  };

  const handleExtractMetadata = async (paper: Paper) => {
    if (onExtractMetadata) {
      onExtractMetadata(paper);
      return;
    }
    setExtractingIds((prev) => new Set(prev).add(paper.id));
    try {
      const { extractMetadata } = await import('../api');
      await extractMetadata(paper.id);
      message.success('元数据提取完成');
      onRefresh();
    } catch {
      message.error('元数据提取失败');
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const openEditModal = (paper: Paper) => {
    setEditModalPaper(paper);
    editForm.setFieldsValue({
      title: paper.title || '',
      authors: paper.authors || '',
      venue: paper.venue || '',
      publish_date: paper.publish_date || '',
      brief_note: paper.brief_note || '',
      tags: paper.tags || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editModalPaper) return;
    setSavingEdit(true);
    try {
      const values = await editForm.validateFields();
      await updatePaper(editModalPaper.id, values);
      message.success('元信息已更新');
      setEditModalOpen(false);
      onRefresh();
    } catch {
      message.error('更新失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const loadAuthorInfos = async (paperId: number) => {
    try {
      const res = await getAuthorInfos(paperId);
      if (res.data.length > 0) {
        setAuthorInfoMap(prev => ({ ...prev, [paperId]: res.data }));
      }
    } catch {
      // ignore
    }
  };

  const handleExploreAuthors = async (paper: Paper) => {
    setAuthorExploreState({
      visible: true,
      paperTitle: paper.title || '',
      currentAuthor: '准备中...',
      completedCount: 0,
      totalCount: 0,
      status: 'exploring',
      activities: [],
    });

    try {
      const response = await fetch(`/api/papers/${paper.id}/explore-authors`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to start exploration');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'progress') {
                setAuthorExploreState(prev => ({
                  ...prev,
                  currentAuthor: event.message,
                  totalCount: event.total || prev.totalCount,
                }));
              } else if (event.type === 'author_done') {
                setAuthorExploreState(prev => ({
                  ...prev,
                  completedCount: event.index,
                  totalCount: event.total,
                  currentAuthor: event.author_name + ' \u2713',
                }));
              } else if (event.type === 'complete') {
                setAuthorExploreState(prev => ({
                  ...prev,
                  status: 'complete',
                  currentAuthor: event.message,
                }));
                loadAuthorInfos(paper.id);
              } else if (event.type === 'error') {
                setAuthorExploreState(prev => ({
                  ...prev,
                  errorMessage: event.message,
                }));
              } else if (event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'thinking') {
                setAuthorExploreState(prev => ({
                  ...prev,
                  activities: [...prev.activities, event as AuthorActivity],
                }));
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      setAuthorExploreState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: err.message,
      }));
    }
  };

  const handleClassifyPaper = async (paper: Paper) => {
    setClassifyingIds((prev) => new Set(prev).add(paper.id));
    notification.info({
      message: '正在分类',
      description: `正在对 "${paper.title}" 进行AI分类...`,
      placement: 'bottomRight',
      duration: 2,
    });
    try {
      const res = await classifyPaper(paper.id);
      const data = res.data as { folders?: any[] };
      const folders = data.folders || [];
      const folderNames = folders.map((f: any) => f.name || f.path).join(', ') || '未分类';
      notification.success({
        message: '分类成功',
        description: `${paper.title} → ${folderNames}`,
        placement: 'bottomRight',
        duration: 4,
      });
      onRefresh();
    } catch (err: any) {
      notification.error({
        message: '分类失败',
        description: `${paper.title}: ${err?.response?.data?.detail || err?.message || '未知错误'}`,
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setClassifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const handleBatchClassify = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要分类的论文');
      return;
    }
    setBatchClassifyOpen(true);
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: selectedRowKeys.length, results: [] });
    try {
      const stream = classifyPapersBatch({ paper_ids: selectedRowKeys.map(Number) });
      for await (const event of stream) {
        try {
          if (event.type === 'progress') {
            const paperTitle = papers.find(p => p.id === event.paper_id)?.title || `论文 #${event.paper_id}`;
            const folderNames = event.folders?.map((f: any) => f.name || f.path).join(', ') || '未分类';
            notification.success({
              message: '论文分类成功',
              description: `${paperTitle} → ${folderNames}`,
              placement: 'bottomRight',
              duration: 3,
            });
            setBatchProgress((prev) => ({
              ...prev,
              current: event.current || prev.current + 1,
              total: event.total || prev.total,
              results: [...prev.results, { paper_id: event.paper_id, title: paperTitle, folders: event.folders }],
            }));
          } else if (event.type === 'error') {
            const paperTitle = papers.find(p => p.id === event.paper_id)?.title || `论文 #${event.paper_id}`;
            notification.error({
              message: '论文分类失败',
              description: `${paperTitle}: ${event.error}`,
              placement: 'bottomRight',
              duration: 4,
            });
            setBatchProgress((prev) => ({
              ...prev,
              current: prev.current + 1,
              results: [...prev.results, { paper_id: event.paper_id, title: paperTitle, error: event.error }],
            }));
          } else if (event.type === 'done') {
            setBatchProgress((prev) => ({ ...prev, current: prev.total }));
          }
        } catch (eventErr) {
          console.error('Error processing event:', eventErr, event);
        }
      }
    } catch (err: any) {
      message.error(`批量分类失败: ${err.message || '未知错误'}`);
      console.error('Batch classify error:', err);
    } finally {
      setBatchRunning(false);
      onRefresh();
    }
  };

  useEffect(() => {
    if (papers.length > 0) {
      for (const paper of papers) {
        loadAuthorInfos(paper.id);
      }
    }
  }, [papers]);

  const treeSelectData = buildTreeSelectData(folders);

  const allColumns: (ColumnsType<Paper>[number] & { visibilityKey?: keyof ColumnVisibility })[] = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: '40%',
      ellipsis: false,
      render: (_, paper) => (
        <div
          style={{ cursor: 'pointer', position: 'relative' }}
          onClick={() => navigate(`/reader/${paper.id}`)}
        >
          {/* MD indicator - positioned absolutely, aligned with expand button */}
          <span
            style={{
              position: 'absolute',
              left: -18,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: paper.has_markdown ? '#52c41a' : '#d9d9d9',
              marginTop: '1px',
            }}
            title={paper.has_markdown ? '已有 Markdown' : '无 Markdown'}
          />
          <div>
            {paper.tags && paper.tags.split(',').filter(Boolean).map((tag, i) => (
              <Tag
                key={tag.trim()}
                color={TAG_COLORS[i % TAG_COLORS.length]}
                style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px', marginRight: 4, borderRadius: 2 }}
              >
                {tag.trim()}
              </Tag>
            ))}
            <Text
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                color: '#1677ff',
                fontWeight: 600,
                fontSize: 13.5,
              }}
            >
              {paper.title}
            </Text>
          </div>
          {paper.brief_note && (
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                color: '#999',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                marginTop: 2,
              }}
            >
              {paper.brief_note}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      visibilityKey: 'authors',
      width: 260,
      ellipsis: false,
      render: (text: string, record: Paper) => {
        if (!text) return <Text type="secondary">-</Text>;
        const infos = authorInfoMap[record.id] || [];
        const infoMap = new Map(infos.map(i => [i.author_name, i]));
        const authors = text.split(',').map(a => a.trim()).filter(Boolean);

        return (
          <div style={{ fontSize: 12, lineHeight: '18px', maxHeight: 54, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', gap: '1px 3px' }}>
            {authors.map((name, idx) => {
              const info = infoMap.get(name);
              return (
                <span key={idx} style={{ whiteSpace: 'nowrap' }}>
                  {info ? (
                    <AuthorPopover author={info}>
                      <a style={{ color: '#1890ff', cursor: 'pointer', fontSize: 12 }}>{name}</a>
                    </AuthorPopover>
                  ) : (
                    <span style={{ color: '#999', fontSize: 12 }}>{name}</span>
                  )}
                  {idx < authors.length - 1 && ','}
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '发表场地',
      dataIndex: 'venue',
      key: 'venue',
      visibilityKey: 'venue',
      width: 120,
      ellipsis: true,
      sorter: (a: Paper, b: Paper) => (a.venue || '').localeCompare(b.venue || ''),
      render: (venue: string | null) => (
        <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: venue }}>
          {venue || '-'}
        </Text>
      ),
    },
    {
      title: '发表时间',
      dataIndex: 'publish_date',
      key: 'publish_date',
      visibilityKey: 'publish_date',
      width: 100,
      sorter: (a: Paper, b: Paper) => (a.publish_date || '').localeCompare(b.publish_date || ''),
      render: (date: string | null) => (
        <Text style={{ fontSize: 13 }}>{date || '-'}</Text>
      ),
    },
    {
      title: '添加时间',
      dataIndex: 'created_at',
      key: 'created_at',
      visibilityKey: 'created_at',
      width: 100,
      sorter: (a: Paper, b: Paper) => (a.created_at || '').localeCompare(b.created_at || ''),
      render: (date: string) => (
        <Text style={{ fontSize: 13 }}>{date ? date.slice(0, 10) : '-'}</Text>
      ),
    },
    {
      title: '重要性',
      dataIndex: 'importance',
      key: 'importance',
      width: 90,
      sorter: (a: Paper, b: Paper) => (a.importance || 0) - (b.importance || 0),
      render: (_, paper) => {
        const colorMap: Record<number, string> = {
          1: '#ffaaaa',
          2: '#ff7875',
          3: '#f5222d',
        };
        const val = paper.importance || 0;
        return (
          <Rate
            count={3}
            value={Math.min(val, 3)}
            style={{
              fontSize: 14,
              color: colorMap[val] || '#fadb14',
            }}
            onChange={async (value) => {
              try {
                await updateImportance(paper.id, value);
                paper.importance = value;
                onRefresh();
              } catch {
                message.error('更新重要性失败');
              }
            }}
          />
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 60,
      render: (_, paper) => {
        const menuItems = [
          {
            key: 'extract',
            icon: <SearchOutlined />,
            label: '自动提取元数据',
            disabled: extractingIds.has(paper.id),
            onClick: () => handleExtractMetadata(paper),
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: '编辑元信息',
            onClick: () => openEditModal(paper),
          },
          {
            key: 'folder',
            icon: <FolderOutlined />,
            label: '管理分类',
            onClick: () => openFolderModal(paper),
          },
          {
            key: 'explore-authors',
            icon: <TeamOutlined />,
            label: '作者探索',
            onClick: () => handleExploreAuthors(paper),
          },
          {
            key: 'ai-classify',
            icon: <RobotOutlined />,
            label: 'AI自动分类',
            disabled: classifyingIds.has(paper.id),
            onClick: () => handleClassifyPaper(paper),
          },
          { type: 'divider' as const },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除',
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: '确认删除此论文？',
                okText: '确认',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => handleDelete(paper.id),
              });
            },
          },
        ];
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button
              type="text"
              size="small"
              icon={<EllipsisOutlined style={{ fontSize: 16 }} />}
              onClick={(e) => e.stopPropagation()}
              loading={extractingIds.has(paper.id)}
            />
          </Dropdown>
        );
      },
    },
  ];

  const columns = allColumns.filter((col) => {
    if (!col.visibilityKey) return true;
    return columnVisibility[col.visibilityKey];
  });

  const columnSettingsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {([
        ['authors', '作者'],
        ['venue', '发表场地'],
        ['publish_date', '发表时间'],
        ['created_at', '添加时间'],
      ] as [keyof ColumnVisibility, string][]).map(([key, label]) => (
        <Checkbox
          key={key}
          checked={columnVisibility[key]}
          onChange={(e) => setColumnVisibility((prev) => ({ ...prev, [key]: e.target.checked }))}
        >
          {label}
        </Checkbox>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        .paper-table .ant-table-row:nth-child(even) td { background: #fafbfc; }
        .paper-table .ant-table-row:hover td { background: #e6f4ff !important; transition: background 0.2s; }
        .paper-table .ant-table-cell { vertical-align: middle; padding: 6px 8px !important; }
        .paper-table .ant-table-thead > tr > th { background: #f5f7fa; font-weight: 600; font-size: 12px; padding: 6px 8px !important; }
        .paper-table .ant-table-expanded-row > td { padding: 4px 8px !important; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => {
              setCheckboxVisible(!checkboxVisible);
              if (checkboxVisible) setSelectedRowKeys([]);
            }}
          >
            批量操作
          </Button>
          {checkboxVisible && selectedRowKeys.length > 0 && (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              size="small"
              onClick={handleBatchClassify}
            >
              批量AI分类 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
        <Popover content={columnSettingsContent} title="显示列" trigger="click" placement="bottomRight">
          <Button type="text" size="small" icon={<SettingOutlined />}>
            列设置
          </Button>
        </Popover>
      </div>
      <Table
        className="paper-table"
        rowKey="id"
        columns={columns}
        dataSource={papers}
        loading={loading}
        rowSelection={checkboxVisible ? {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          fixed: 'left',
          columnWidth: 48,
        } : undefined}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 篇` }}
        size="small"
        tableLayout="fixed"
        expandable={{
          expandedRowRender: (paper) => (
            <div style={{ maxHeight: 200, overflow: 'auto', padding: '2px 0' }}>
              <PaperFileExplorer paperId={paper.id} />
            </div>
          ),
          expandRowByClick: false,
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无论文，点击上方按钮添加"
              style={{ padding: '40px 0' }}
            />
          ),
        }}
      />

      {/* Folder modal */}
      <Modal
        title="管理分类"
        open={folderModalOpen}
        onOk={handleSaveFolders}
        onCancel={() => setFolderModalOpen(false)}
        confirmLoading={savingFolders}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">为「{folderModalPaper?.title}」选择分类：</Text>
        </div>
        <TreeSelect
          style={{ width: '100%' }}
          treeData={treeSelectData}
          value={selectedFolderIds}
          onChange={setSelectedFolderIds}
          treeCheckable
          showCheckedStrategy={TreeSelect.SHOW_ALL}
          placeholder="选择分类"
          allowClear
        />
      </Modal>

      {/* Edit metadata modal */}
      <Modal
        title="编辑元信息"
        open={editModalOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={savingEdit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="authors" label="作者">
            <Input />
          </Form.Item>
          <Form.Item name="venue" label="发表场地">
            <Input />
          </Form.Item>
          <Form.Item name="publish_date" label="发表时间">
            <Input placeholder="如 2024-01-15" />
          </Form.Item>
          <Form.Item name="brief_note" label="简记">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="多个标签用逗号分隔" />
          </Form.Item>
        </Form>
      </Modal>

      <AuthorExploreProgress
        visible={authorExploreState.visible}
        paperTitle={authorExploreState.paperTitle}
        currentAuthor={authorExploreState.currentAuthor}
        completedCount={authorExploreState.completedCount}
        totalCount={authorExploreState.totalCount}
        status={authorExploreState.status}
        errorMessage={authorExploreState.errorMessage}
        activities={authorExploreState.activities}
        onClose={() => setAuthorExploreState(prev => ({ ...prev, visible: false }))}
      />

      {/* Batch classify modal */}
      <Modal
        title="批量AI分类"
        open={batchClassifyOpen}
        onCancel={() => { if (!batchRunning) { setBatchClassifyOpen(false); setSelectedRowKeys([]); } }}
        footer={
          batchRunning ? null : (
            <Button type="primary" onClick={() => { setBatchClassifyOpen(false); setSelectedRowKeys([]); }}>
              完成
            </Button>
          )
        }
        closable={!batchRunning}
        maskClosable={false}
        destroyOnClose
      >
        <Progress
          percent={batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}
          status={batchRunning ? 'active' : 'success'}
          format={() => `${batchProgress.current} / ${batchProgress.total}`}
        />
        <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 12 }}>
          {batchProgress.results.map((r, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
              <Text ellipsis style={{ maxWidth: 300 }}>{r.title || `论文 #${r.paper_id}`}</Text>
              {r.error ? (
                <Tag color="red" style={{ marginLeft: 8 }}>失败: {r.error}</Tag>
              ) : (
                r.folders?.map((f: any) => <Tag color="blue" key={f.id || f} style={{ marginLeft: 4 }}>{f.name || f.path || f}</Tag>)
              )}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
