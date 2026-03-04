import { useState, useEffect, useCallback } from 'react';
import { Button, Spin, Modal, Card, Checkbox, message, Progress, Typography, Tree, notification } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import FolderTree from '../components/FolderTree';
import PaperTable from '../components/PaperTable';
import SearchBar from '../components/SearchBar';
import UploadModal from '../components/UploadModal';
import MetadataProgress from '../components/MetadataProgress';
import type { Paper, Folder } from '../types';
import { getPapers, searchPapers, getFolders, generateFolderProposals, applyFolderProposal } from '../api';

const { Text } = Typography;

export default function HomePage() {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [extractPaper, setExtractPaper] = useState<{ id: number; title: string } | null>(null);

  // Folder proposal state
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [selectedProposalIdx, setSelectedProposalIdx] = useState(0);
  const [reclassifyAfterApply, setReclassifyAfterApply] = useState(true);
  const [applyRunning, setApplyRunning] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

  const handleExtractMetadata = (paper: Paper) => {
    setExtractPaper({ id: paper.id, title: paper.title });
  };

  const handleOpenFolderProposal = async () => {
    setProposalModalOpen(true);
    setProposalLoading(true);
    setProposals([]);
    setSelectedProposalIdx(0);
    setApplyRunning(false);
    setApplyProgress({ current: 0, total: 0 });
    try {
      const res = await generateFolderProposals();
      const data = res.data as { proposals?: any[] };
      setProposals(data.proposals || []);
      if (!data.proposals?.length) {
        message.warning('未生成任何目录方案');
      }
    } catch {
      message.error('目录方案生成失败');
    } finally {
      setProposalLoading(false);
    }
  };

  const handleApplyProposal = async () => {
    if (!proposals[selectedProposalIdx]) return;
    setApplyRunning(true);
    setApplyProgress({ current: 0, total: 0 });
    try {
      const stream = applyFolderProposal({
        proposal: proposals[selectedProposalIdx],
        reclassify: reclassifyAfterApply,
      });
      for await (const event of stream) {
        if (event.type === 'progress') {
          setApplyProgress({ current: event.current || 0, total: event.total || 0 });
        } else if (event.type === 'classify_progress') {
          // Show notification for each paper classification
          const paperTitle = papers.find(p => p.id === event.paper_id)?.title || `论文 #${event.paper_id}`;
          const folderNames = event.folders?.map((f: any) => f.name || f.path).join(', ') || '未分类';
          notification.success({
            message: '论文分类成功',
            description: `${paperTitle} → ${folderNames}`,
            placement: 'bottomRight',
            duration: 3,
          });
        } else if (event.type === 'error') {
          const paperTitle = papers.find(p => p.id === event.paper_id)?.title || `论文 #${event.paper_id}`;
          notification.error({
            message: '论文分类失败',
            description: `${paperTitle}: ${event.error}`,
            placement: 'bottomRight',
            duration: 4,
          });
        } else if (event.type === 'folders_created') {
          message.success(`已创建 ${event.count || 0} 个目录`);
        } else if (event.type === 'done') {
          message.success('目录方案应用完成');
        }
      }
    } catch (err) {
      message.error('应用目录方案失败');
      console.error('Apply folder proposal error:', err);
    } finally {
      setApplyRunning(false);
      setProposalModalOpen(false);
      // Refresh all data to ensure UI is updated
      await Promise.all([loadFolders(), loadPapers(), loadAllPapers()]);
      setFolderRefreshKey(prev => prev + 1);
    }
  };

  const proposalToTreeData = (node: any): any => {
    if (!node) return [];
    const children = node.children || node.subfolders || [];
    return {
      title: node.name || node.title,
      key: node.name || node.title,
      children: children.map(proposalToTreeData),
    };
  };

  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      // Always load all papers, then filter on frontend
      const res = await getPapers(null);
      const allPapersData = Array.isArray(res.data) ? res.data : [];
      setAllPapers(allPapersData);

      // Filter papers based on selected folder
      if (selectedFolderId === null) {
        // Show all papers
        setPapers(allPapersData);
      } else if (selectedFolderId === -1) {
        // Show uncategorized papers
        setPapers(allPapersData.filter(p => !p.folder_ids || p.folder_ids.length === 0));
      } else {
        // Get all descendant folder IDs (including the selected folder itself)
        const getDescendantIds = (folderId: number): number[] => {
          const descendants = [folderId];
          for (const f of folders) {
            if (f.parent_id === folderId) {
              descendants.push(...getDescendantIds(f.id));
            }
          }
          return descendants;
        };

        const targetFolderIds = getDescendantIds(selectedFolderId);

        // Filter papers that belong to any of the target folders
        const filteredPapers = allPapersData.filter(paper => {
          const paperFolderIds = paper.folder_ids || [];
          return paperFolderIds.some(fid => targetFolderIds.includes(fid));
        });

        setPapers(filteredPapers);
      }
    } catch {
      setPapers([]);
      setAllPapers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, folders]);

  const loadAllPapers = async () => {
    try {
      const res = await getPapers(null);
      setAllPapers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAllPapers([]);
    }
  };

  const loadFolders = async () => {
    try {
      const res = await getFolders();
      setFolders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFolders([]);
    }
  };

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    loadFolders();
    loadAllPapers();
  }, []);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      loadPapers();
      return;
    }
    setLoading(true);
    try {
      const res = await searchPapers(query);
      setPapers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPapers([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
      <div
        style={{
          width: 250,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FolderTree
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            papers={allPapers}
            onOpenFolderProposal={handleOpenFolderProposal}
            refreshKey={folderRefreshKey}
          />
        </div>
      </div>
      <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setUploadOpen(true)}
          >
            添加论文
          </Button>
        </div>
        <Spin spinning={loading}>
          <PaperTable
            papers={papers}
            loading={false}
            onRefresh={() => { loadPapers(); loadAllPapers(); }}
            folders={folders}
            onExtractMetadata={handleExtractMetadata}
          />
        </Spin>
        <UploadModal
          open={uploadOpen}
          folders={folders}
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            loadPapers();
            loadAllPapers();
            loadFolders();
          }}
        />
      </div>
      <MetadataProgress
        visible={extractPaper !== null}
        paperId={extractPaper?.id ?? null}
        paperTitle={extractPaper?.title ?? ''}
        onClose={() => setExtractPaper(null)}
        onComplete={() => { loadPapers(); loadAllPapers(); }}
      />

      {/* Folder proposal modal */}
      <Modal
        title="目录自动规划"
        open={proposalModalOpen}
        onCancel={() => { if (!applyRunning) setProposalModalOpen(false); }}
        closable={!applyRunning}
        maskClosable={false}
        width={640}
        destroyOnClose
        footer={
          applyRunning ? null : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Checkbox checked={reclassifyAfterApply} onChange={(e) => setReclassifyAfterApply(e.target.checked)}>
                应用后自动重新分类所有论文
              </Checkbox>
              <Button
                type="primary"
                disabled={proposals.length === 0 || proposalLoading}
                onClick={handleApplyProposal}
              >
                应用选中方案
              </Button>
            </div>
          )
        }
      >
        {proposalLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">正在生成目录方案...</Text></div>
          </div>
        ) : applyRunning ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Progress
              percent={applyProgress.total > 0 ? Math.round((applyProgress.current / applyProgress.total) * 100) : 0}
              status="active"
              format={() => applyProgress.total > 0 ? `${applyProgress.current} / ${applyProgress.total}` : '创建目录中...'}
            />
            <div style={{ marginTop: 12 }}><Text type="secondary">正在应用目录方案并分类论文...</Text></div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            {proposals.map((proposal, idx) => (
              <Card
                key={idx}
                size="small"
                title={`方案 ${idx + 1}`}
                hoverable
                style={{
                  flex: 1,
                  border: selectedProposalIdx === idx ? '2px solid #1890ff' : '1px solid #d9d9d9',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedProposalIdx(idx)}
              >
                <Tree
                  treeData={Array.isArray(proposal.folders || proposal) ? (proposal.folders || proposal).map(proposalToTreeData) : [proposalToTreeData(proposal)]}
                  defaultExpandAll
                  selectable={false}
                  style={{ fontSize: 12 }}
                />
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
