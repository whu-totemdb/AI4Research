import { useState, useEffect } from 'react';
import { Form, Input, Button, Space, message, Typography, Divider } from 'antd';
import {
  CloudSyncOutlined,
  ApiOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { SyncConfig } from '../types';
import { getSyncConfig, saveSyncConfig, testSyncConnection, triggerSync } from '../api';

const { Text } = Typography;

export default function SyncSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await getSyncConfig();
      const config = res.data as SyncConfig;
      form.setFieldsValue({
        webdav_url: config.webdav_url,
        username: config.username,
        password: config.password,
        sync_folder: config.sync_folder,
      });
      setLastSync(config.last_sync_at);
    } catch {
      // No config yet
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await saveSyncConfig(values);
      message.success('Configuration saved');
    } catch {
      message.error('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const res = await testSyncConnection(values);
      const result = res.data as { success: boolean; message: string };
      if (result.success) {
        message.success('Connection successful');
      } else {
        message.error(result.message || 'Connection failed');
      }
    } catch {
      message.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      message.success('Sync completed');
      loadConfig();
    } catch {
      message.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          webdav_url: 'https://dav.jianguoyun.com/dav/',
          sync_folder: '/AI4Research',
        }}
      >
        <Form.Item
          label="WebDAV Server URL"
          name="webdav_url"
          rules={[{ required: true, message: 'Please enter server URL' }]}
        >
          <Input placeholder="https://dav.jianguoyun.com/dav/" />
        </Form.Item>
        <Form.Item
          label="Username"
          name="username"
          rules={[{ required: true, message: 'Please enter username' }]}
        >
          <Input placeholder="Email or username" />
        </Form.Item>
        <Form.Item
          label="Password / App Token"
          name="password"
          rules={[{ required: true, message: 'Please enter password' }]}
        >
          <Input.Password placeholder="App-specific password" />
        </Form.Item>
        <Form.Item
          label="Sync Directory"
          name="sync_folder"
          rules={[{ required: true, message: 'Please enter sync directory' }]}
        >
          <Input placeholder="/AI4Research" />
        </Form.Item>
      </Form>

      <Space wrap>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSave} loading={loading}>
          Save Config
        </Button>
        <Button icon={<ApiOutlined />} onClick={handleTest} loading={testing}>
          Test Connection
        </Button>
      </Space>

      <Divider />

      <Space direction="vertical">
        <Button
          type="primary"
          ghost
          icon={<CloudSyncOutlined />}
          onClick={handleSync}
          loading={syncing}
        >
          Sync Now
        </Button>
        {lastSync && (
          <Text type="secondary">Last synced: {new Date(lastSync).toLocaleString()}</Text>
        )}
      </Space>
    </div>
  );
}
