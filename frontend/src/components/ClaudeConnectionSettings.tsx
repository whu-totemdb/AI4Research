import { useState, useEffect } from 'react';
import { Card, Radio, Input, Button, Alert, Space, message, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, ApiOutlined } from '@ant-design/icons';
import {
  getConnectionConfig,
  saveConnectionConfig,
  testDockerConnection,
  type ClaudeConnectionConfig,
} from '../services/claudeConnectionService';

export default function ClaudeConnectionSettings() {
  const [config, setConfig] = useState<ClaudeConnectionConfig>({ mode: 'docker', dockerUrl: 'http://localhost:8080' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const loaded = getConnectionConfig();
    setConfig(loaded);
    setShowWarning(loaded.mode === 'local');
  }, []);

  const handleModeChange = (mode: 'docker' | 'local') => {
    setConfig((prev) => ({ ...prev, mode }));
    setShowWarning(mode === 'local');
    setTestResult(null);
  };

  const handleUrlChange = (url: string) => {
    setConfig((prev) => ({ ...prev, dockerUrl: url }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!config.dockerUrl) {
      message.error('Please enter a connection URL');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const result = await testDockerConnection(config.dockerUrl);
      setTestResult(result);
      if (result.success) {
        message.success('Connection test successful');
      } else {
        message.error(`Connection test failed: ${result.message}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message: errorMsg });
      message.error(`Connection test failed: ${errorMsg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveConnectionConfig(config);
    message.success('Connection settings saved');
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Connection Mode</div>
          <Radio.Group value={config.mode} onChange={(e) => handleModeChange(e.target.value)}>
            <Space direction="vertical">
              <Radio value="docker">
                <Space>
                  Docker Mode (Recommended)
                  <Tag color="green">Secure</Tag>
                </Space>
              </Radio>
              <Radio value="local">
                <Space>
                  Local Mode
                  <Tag color="orange">Not Recommended</Tag>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        {config.mode === 'docker' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Docker Server URL</div>
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Input
                value={config.dockerUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="http://localhost:8080"
                prefix={<ApiOutlined />}
              />
              <Button
                type="primary"
                loading={testing}
                onClick={handleTestConnection}
                icon={<CheckCircleOutlined />}
              >
                Test Connection
              </Button>
            </Space.Compact>

            {testResult && (
              <Alert
                type={testResult.success ? 'success' : 'error'}
                message={testResult.success ? 'Connection Successful' : 'Connection Failed'}
                description={testResult.message}
                icon={testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}

            <div style={{ color: '#666', fontSize: 13 }}>
              Connect to Claude Code running in a Docker container. This is the recommended and secure way to use Claude Code.
            </div>
          </div>
        )}

        {config.mode === 'local' && (
          <Alert
            type="warning"
            message="Security Warning"
            description={
              <div>
                <p style={{ marginBottom: 8 }}>
                  <strong>Local mode is not recommended</strong> as it exposes your API keys and allows direct file system access.
                </p>
                <div style={{ marginBottom: 8 }}>
                  <strong>Risks include:</strong>
                </div>
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  <li>Direct access to your file system</li>
                  <li>Exposure of API keys and credentials</li>
                  <li>Potential security vulnerabilities</li>
                  <li>No sandboxing or isolation</li>
                </ul>
                <p style={{ marginTop: 12, marginBottom: 0 }}>
                  Please use Docker mode for production environments.
                </p>
              </div>
            }
            icon={<WarningOutlined />}
            showIcon
            closable={showWarning}
            onClose={() => setShowWarning(false)}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Button type="primary" onClick={handleSave} icon={<CheckCircleOutlined />}>
        Save Configuration
      </Button>
    </div>
  );
}
