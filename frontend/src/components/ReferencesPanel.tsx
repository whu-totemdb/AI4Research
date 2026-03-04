import { useState, useEffect, useCallback } from 'react';
import { List, Button, Empty, message, Typography, Modal, Input, InputNumber, Popconfirm, Spin } from 'antd';
import { DeleteOutlined, PlusOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import type { Paper } from '../types';

const { Text } = Typography;
const { TextArea } = Input;

interface PaperReferenceItem {
  id: number;
  source_paper_id: number;
  target_paper_id: number;
  source_page: number | null;
  description: string | null;
  created_at: string | null;
  other_paper_title: string;
  other_paper_id: number;
}

interface ReferencesPanelProps {
  paperId: number;
}

export default function ReferencesPanel({ paperId }: ReferencesPanelProps) {
  const navigate = useNavigate();
  const [refs, setRefs] = useState<PaperReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Add-reference form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Paper[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PaperReferenceItem[]>(`/references/by-paper/${paperId}`);
      setRefs(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/references/${id}`);
      message.success('Reference removed');
      loadRefs();
    } catch {
      message.error('Failed to delete reference');
    }
  };

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<Paper[]>('/papers', { params: { search: value } });
      const results = (Array.isArray(res.data) ? res.data : []).filter((p) => p.id !== paperId);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const resetModal = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPaper(null);
    setSourcePage(null);
    setDescription('');
  };

  const handleCreate = async () => {
    if (!selectedPaper) return;
    setSubmitting(true);
    try {
      await api.post('/references', {
        source_paper_id: paperId,
        target_paper_id: selectedPaper.id,
        source_page: sourcePage,
        description: description || null,
      });
      message.success('Reference added');
      setModalOpen(false);
      resetModal();
      loadRefs();
    } catch {
      message.error('Failed to add reference');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong>Cross References</Text>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Add
        </Button>
      </div>

      {!loading && refs.length === 0 ? (
        <Empty description="No references yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          loading={loading}
          dataSource={refs}
          renderItem={(ref) => (
            <List.Item
              style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <LinkOutlined style={{ marginRight: 6, color: '#1a73e8' }} />
                    <a
                      style={{ cursor: 'pointer', color: '#1a73e8' }}
                      onClick={() => navigate(`/reader/${ref.other_paper_id}`)}
                    >
                      {ref.other_paper_title}
                    </a>
                  </div>
                  {ref.source_page && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Page {ref.source_page}
                    </Text>
                  )}
                  {ref.description && (
                    <div
                      style={{
                        padding: '4px 8px',
                        background: '#f6f8fa',
                        borderLeft: '3px solid #1a73e8',
                        borderRadius: 4,
                        marginTop: 4,
                        fontSize: 12,
                        color: '#555',
                      }}
                    >
                      {ref.description}
                    </div>
                  )}
                </div>
                <Popconfirm title="Remove this reference?" onConfirm={() => handleDelete(ref.id)}>
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </div>
              {ref.created_at && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {new Date(ref.created_at).toLocaleString()}
                </Text>
              )}
            </List.Item>
          )}
        />
      )}

      <Modal
        title="Add Cross Reference"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); resetModal(); }}
        onOk={handleCreate}
        okText="Add Reference"
        okButtonProps={{ disabled: !selectedPaper, loading: submitting }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Search for a paper</Text>
            <Input.Search
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSearch={handleSearch}
              loading={searching}
              allowClear
            />
          </div>

          {searching && <Spin size="small" />}

          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4 }}>
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPaper(p)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selectedPaper?.id === p.id ? '#e6f4ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text ellipsis style={{ fontSize: 13 }}>{p.title}</Text>
                </div>
              ))}
            </div>
          )}

          {selectedPaper && (
            <div style={{ padding: '6px 10px', background: '#f6f8fa', borderRadius: 4 }}>
              <Text strong style={{ fontSize: 13 }}>Selected: </Text>
              <Text style={{ fontSize: 13 }}>{selectedPaper.title}</Text>
            </div>
          )}

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Page number (optional)</Text>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              placeholder="Source page"
              value={sourcePage}
              onChange={(v) => setSourcePage(v)}
            />
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Description (optional)</Text>
            <TextArea
              rows={2}
              placeholder="Why is this paper related?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
