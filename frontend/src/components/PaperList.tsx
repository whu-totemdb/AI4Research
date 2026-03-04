import { Card, Tag, Typography, Empty, Popconfirm, message } from 'antd';
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Paper } from '../types';
import { deletePaper } from '../api';

interface PaperListProps {
  papers: Paper[];
  loading: boolean;
  onRefresh: () => void;
}

const { Text, Paragraph } = Typography;

export default function PaperList({ papers, loading, onRefresh }: PaperListProps) {
  const navigate = useNavigate();

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePaper(id);
      message.success('Paper deleted');
      onRefresh();
    } catch {
      message.error('Failed to delete paper');
    }
  };

  if (!loading && papers.length === 0) {
    return <Empty description="No papers in this folder" style={{ marginTop: 80 }} />;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
        padding: '4px 0',
      }}
    >
      {papers.map((paper) => (
        <Card
          key={paper.id}
          hoverable
          loading={loading}
          onClick={() => navigate(`/reader/${paper.id}`)}
          style={{ borderRadius: 8 }}
          styles={{ body: { padding: 16 } }}
          actions={[
            <Popconfirm
              key="del"
              title="Delete this paper?"
              onConfirm={(e) => handleDelete(paper.id, e as unknown as React.MouseEvent)}
              onCancel={(e) => e?.stopPropagation()}
            >
              <DeleteOutlined
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#ff4d4f' }}
              />
            </Popconfirm>,
          ]}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <FileTextOutlined style={{ fontSize: 32, color: '#1a73e8', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis style={{ fontSize: 15, display: 'block' }}>
                {paper.title}
              </Text>
              {paper.authors && (
                <Paragraph
                  type="secondary"
                  ellipsis={{ rows: 1 }}
                  style={{ margin: '4px 0', fontSize: 13 }}
                >
                  {paper.authors}
                </Paragraph>
              )}
              <div style={{ marginTop: 6 }}>
                {paper.tags &&
                  paper.tags.split(',').map((tag) => (
                    <Tag key={tag.trim()} color="blue" style={{ marginBottom: 4 }}>
                      {tag.trim()}
                    </Tag>
                  ))}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(paper.created_at).toLocaleDateString()}
              </Text>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
