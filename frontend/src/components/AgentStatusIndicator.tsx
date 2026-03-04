import { Alert, Space, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';

interface AgentStatusIndicatorProps {
  status: 'idle' | 'generating_index' | 'searching' | 'thinking' | 'error';
  message?: string;
  error?: string;
}

export default function AgentStatusIndicator({ status, message, error }: AgentStatusIndicatorProps) {
  if (status === 'idle') return null;

  const getStatusConfig = () => {
    switch (status) {
      case 'generating_index':
        return {
          type: 'info' as const,
          icon: <SyncOutlined spin />,
          message: message || '正在生成页面索引...',
          description: '首次使用需要生成索引，请稍候',
        };
      case 'searching':
        return {
          type: 'info' as const,
          icon: <SyncOutlined spin />,
          message: message || '正在检索相关页面...',
        };
      case 'thinking':
        return {
          type: 'info' as const,
          icon: <Spin size="small" />,
          message: message || 'Agent 正在思考...',
        };
      case 'error':
        return {
          type: 'error' as const,
          icon: <CloseCircleOutlined />,
          message: error || '操作失败',
          description: error,
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <Alert
      type={config.type}
      message={
        <Space size={8}>
          {config.icon}
          <span>{config.message}</span>
        </Space>
      }
      description={config.description}
      showIcon={false}
      style={{ marginBottom: 12, fontSize: 12 }}
      banner
    />
  );
}
