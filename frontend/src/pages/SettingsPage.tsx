import { useState, useEffect } from 'react';
import { Tabs, Form, Input, Button, Space, message, Typography, List, Radio, Popconfirm, Select, Tag, Spin, Switch, Checkbox, Card, Collapse, InputNumber } from 'antd';
import {
  SettingOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import SyncSettings from '../components/SyncSettings';
import ClaudeConnectionSettings from '../components/ClaudeConnectionSettings';
import type { AIProvider, AgentServiceConfig } from '../types';
import { getSetting, updateSetting, getAIProviders, saveAIProviders, getMCPTools, testMCPTool, getAgentServices, saveAgentServices, getClassifySettings, saveClassifySettings, getTranslationSettings, saveTranslationSettings } from '../api';

const { Title } = Typography;

function MinerUSettings() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetting('mineru_api_key')
      .then((res) => {
        const data = res.data as { value?: string };
        if (data.value) setApiKey(data.value);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateSetting('mineru_api_key', apiKey);
      message.success('MinerU API Key 已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form layout="vertical">
        <Form.Item label="MinerU API Key">
          <Input.Password
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入 MinerU API Key"
          />
        </Form.Item>
      </Form>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
        保存
      </Button>
    </div>
  );
}

function AIProviderSettings() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAIProviders()
      .then((res) => {
        const data = res.data;
        setProviders(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateProvider = (index: number, field: keyof AIProvider, value: any) => {
    setProviders((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'is_default' && value) {
        next.forEach((_p, i) => {
          if (i !== index) next[i] = { ...next[i], is_default: false };
        });
      }
      return next;
    });
  };

  const addProvider = () => {
    setProviders((prev) => [
      ...prev,
      {
        id: `provider_${Date.now()}`,
        name: '',
        provider_type: 'openai',
        api_url: '',
        api_key: '',
        model: '',
        is_default: prev.length === 0,
      } as any,
    ]);
  };

  const removeProvider = (index: number) => {
    setProviders((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAIProviders(providers);
      message.success('AI 服务配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <List
        loading={loading}
        dataSource={providers}
        renderItem={(provider, index) => (
          <List.Item
            style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  placeholder="名称"
                  value={provider.name}
                  onChange={(e) => updateProvider(index, 'name', e.target.value)}
                  style={{ width: 150 }}
                />
                <Select
                  value={(provider as any).provider_type || 'openai'}
                  onChange={(v) => {
                    const next = [...providers];
                    next[index] = { ...next[index], provider_type: v } as any;
                    setProviders(next);
                  }}
                  style={{ width: 150 }}
                  options={[
                    { value: 'openai', label: 'OpenAI 兼容' },
                    { value: 'claude', label: 'Claude (Anthropic)' },
                  ]}
                />
                <Input
                  placeholder="API URL"
                  value={provider.api_url}
                  onChange={(e) => updateProvider(index, 'api_url', e.target.value)}
                  style={{ flex: 1 }}
                />
                <Popconfirm title="确认删除？" onConfirm={() => removeProvider(index)} okText="确认" cancelText="取消">
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input.Password
                  placeholder="API Key"
                  value={provider.api_key}
                  onChange={(e) => updateProvider(index, 'api_key', e.target.value)}
                  style={{ flex: 1 }}
                />
                <Input
                  placeholder="模型名称"
                  value={provider.model}
                  onChange={(e) => updateProvider(index, 'model', e.target.value)}
                  style={{ width: 200 }}
                />
                <Radio
                  checked={provider.is_default}
                  onChange={() => updateProvider(index, 'is_default', true)}
                >
                  默认
                </Radio>
              </div>
            </div>
          </List.Item>
        )}
        locale={{ emptyText: '暂无 AI 服务配置' }}
      />
      <Space style={{ marginTop: 16 }}>
        <Button icon={<PlusOutlined />} onClick={addProvider}>
          添加服务
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存全部
        </Button>
      </Space>
    </div>
  );
}

const DEFAULT_SUMMARY_PROMPT = `请对以下学术论文进行全面总结，使用Markdown格式，包含：
## 研究背景与动机
## 核心方法
## 实验设计与结果
## 主要贡献
## 局限性与未来工作
## 关键公式（保留LaTeX格式）

论文内容：
{content}`;

function SummaryPromptSettings() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetting('summary_prompt')
      .then((res) => {
        const data = res.data as { value?: string };
        if (data.value) setPrompt(data.value);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (prompt.trim() && !prompt.includes('{content}')) {
      message.error('提示词必须包含 {content} 占位符');
      return;
    }
    setLoading(true);
    try {
      await updateSetting('summary_prompt', prompt);
      message.success('总结提示词已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_SUMMARY_PROMPT);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form layout="vertical">
        <Form.Item
          label="总结提示词模板"
          help="使用 {content} 作为论文内容的占位符。留空则使用默认提示词。"
        >
          <Input.TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={DEFAULT_SUMMARY_PROMPT}
            rows={10}
            style={{ fontFamily: 'monospace', fontSize: 13 }}
          />
        </Form.Item>
      </Form>
      <Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
          保存
        </Button>
        <Button onClick={handleReset}>
          恢复默认
        </Button>
      </Space>
    </div>
  );
}

interface MCPTool {
  name: string;
  description: string;
  requires_api_key: boolean;
  api_key_setting: string;
  available: boolean;
}

function MCPToolsSettings() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingTool, setTestingTool] = useState<string | null>(null);

  const loadTools = async () => {
    setLoading(true);
    try {
      const res = await getMCPTools();
      const toolList = Array.isArray(res.data) ? res.data : [];
      setTools(toolList);

      // Dynamically load API key settings for tools requiring configuration
      const settingKeys = Array.from(
        new Set(
          toolList
            .filter((t: MCPTool) => t.requires_api_key && t.api_key_setting)
            .map((t: MCPTool) => t.api_key_setting)
        )
      );
      for (const key of settingKeys) {
        getSetting(key)
          .then((resp) => {
            const data = resp.data as { value?: string };
            if (typeof data.value === 'string') {
              setApiKeys((prev) => ({ ...prev, [key]: data.value! }));
            }
          })
          .catch(() => {});
      }
    } catch {
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const handleSaveKey = async (settingKey: string) => {
    setSavingKey(settingKey);
    try {
      await updateSetting(settingKey, apiKeys[settingKey] || '');
      message.success(`${settingKey} 已保存`);
      loadTools();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTest = async (toolName: string) => {
    setTestingTool(toolName);
    try {
      const res = await testMCPTool(toolName);
      const data = res.data as { success?: boolean; message?: string };
      if (data.success) {
        message.success(`${toolName}: ${data.message || '测试通过'}`);
      } else {
        message.warning(`${toolName}: ${data.message || '测试失败'}`);
      }
    } catch {
      message.error(`${toolName} 测试失败`);
    } finally {
      setTestingTool(null);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
        配置外部搜索工具的API密钥，用于自动提取论文元信息
      </div>
      <Spin spinning={loading}>
        <List
          dataSource={tools}
          renderItem={(tool) => (
            <List.Item style={{ display: 'block', padding: '14px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{tool.name}</span>
                  <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{tool.description}</span>
                </div>
                <Space size={8}>
                  {tool.available ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">{tool.requires_api_key ? '已配置' : '就绪'}</Tag>
                  ) : tool.requires_api_key ? (
                    <Tag icon={<CloseCircleOutlined />} color="warning">未配置</Tag>
                  ) : (
                    <Tag icon={<CheckCircleOutlined />} color="success">就绪</Tag>
                  )}
                  <Button
                    size="small"
                    icon={<ExperimentOutlined />}
                    loading={testingTool === tool.name}
                    onClick={() => handleTest(tool.name)}
                  >
                    测试
                  </Button>
                </Space>
              </div>
              {tool.requires_api_key && tool.api_key_setting && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input.Password
                    value={apiKeys[tool.api_key_setting] || ''}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [tool.api_key_setting]: e.target.value }))}
                    placeholder={`输入 ${tool.api_key_setting}`}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    icon={<SaveOutlined />}
                    loading={savingKey === tool.api_key_setting}
                    onClick={() => handleSaveKey(tool.api_key_setting)}
                  >
                    保存
                  </Button>
                </div>
              )}
            </List.Item>
          )}
          locale={{ emptyText: '暂无已注册的搜索工具' }}
        />
      </Spin>
    </div>
  );
}

function AgentServicesSettings() {
  const [services, setServices] = useState<AgentServiceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allTools, setAllTools] = useState<string[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [contextChars, setContextChars] = useState(1000);
  const [concurrency, setConcurrency] = useState(3);
  const [providerId, setProviderId] = useState('');
  const [folderGenPrompt, setFolderGenPrompt] = useState('');
  const priorityOptions = [
    { label: '优先级第一', value: 1 },
    { label: '优先级第二', value: 2 },
    { label: '优先级第三', value: 3 },
    { label: '兜底（前三层失败后）', value: 99 },
  ];
  const serviceNameMap: Record<string, string> = {
    author_exploration: '作者探索',
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAgentServices(),
      getMCPTools(),
      getClassifySettings().catch(() => ({ data: {} })),
      getAIProviders().catch(() => ({ data: [] })),
    ])
      .then(([svcRes, toolRes, settingsRes, providersRes]) => {
        const svcData = svcRes.data;
        const toolData = toolRes.data as MCPTool[];
        const toolNames = Array.isArray(toolData) ? toolData.map((t) => t.name) : [];
        setAllTools(toolNames);
        setServices(Array.isArray(svcData) ? svcData : []);

        const s = settingsRes.data as any;
        if (s.classify_context_chars) setContextChars(s.classify_context_chars);
        if (s.classify_concurrency) setConcurrency(s.classify_concurrency);
        if (s.classify_provider_id) setProviderId(s.classify_provider_id);
        if (s.folder_gen_prompt) setFolderGenPrompt(s.folder_gen_prompt);
        setProviders(Array.isArray(providersRes.data) ? providersRes.data : []);
      })
      .catch(() => {
        setServices([]);
        setAllTools([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateService = (index: number, patch: Partial<AgentServiceConfig>) => {
    setServices((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const updateToolPriority = (index: number, tool: string, priority: number) => {
    setServices((prev) => {
      const next = [...prev];
      const svc = next[index];
      const current = { ...(svc.tool_priority || {}) };
      current[tool] = priority;
      next[index] = { ...svc, tool_priority: current };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveAgentServices(services),
        saveClassifySettings({
          classify_context_chars: contextChars,
          classify_concurrency: concurrency,
          classify_provider_id: providerId,
          folder_gen_prompt: folderGenPrompt,
        }),
      ]);
      message.success('AI Agent 服务配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
        为每个 AI Agent 功能配置可启用工具、工具优先级与关键提示词（当前已支持：作者探索）。
      </div>
      <Spin spinning={loading}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map((svc, index) => {
            const displayName = serviceNameMap[svc.id] || svc.name || svc.id;
            const toolsForService = Array.from(
              new Set([...(allTools || []), ...((svc.enabled_tools || []) as string[])])
            );
            return (
              <Card
                key={svc.id || index}
                size="small"
                bodyStyle={{ padding: 12 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{displayName}</div>
                  <Space size={8}>
                    <span style={{ color: '#666', fontSize: 12 }}>启用</span>
                    <Switch
                      checked={svc.enabled}
                      onChange={(checked) => updateService(index, { enabled: checked })}
                    />
                  </Space>
                </div>

                <div style={{ marginTop: 8 }}>
                  <Collapse
                    ghost
                    items={[
                      {
                        key: 'settings',
                        label: '设置',
                        children: (
                          <Form layout="vertical">
                            <Form.Item label="可启用工具" style={{ marginBottom: 12 }}>
                              <Checkbox.Group
                                value={svc.enabled_tools || []}
                                options={toolsForService.map((t) => ({ label: t, value: t }))}
                                onChange={(vals) => updateService(index, { enabled_tools: vals as string[] })}
                              />
                            </Form.Item>
                            <Form.Item
                              label="工具优先级"
                              style={{ marginBottom: 12 }}
                              help="执行顺序：优先级第一 → 第二 → 第三。仅在当前层级调用失败或未获得有效信息时，才进入下一层；其他工具作为兜底层调用。"
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {toolsForService.map((tool) => (
                                  <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ minWidth: 140, fontSize: 13 }}>{tool}</div>
                                    <Select
                                      size="small"
                                      style={{ width: 220 }}
                                      value={svc.tool_priority?.[tool] ?? (svc.enabled_tools?.includes(tool) ? 99 : 99)}
                                      onChange={(v) => updateToolPriority(index, tool, v)}
                                      options={priorityOptions}
                                    />
                                  </div>
                                ))}
                              </div>
                            </Form.Item>
                            <Form.Item
                              label="关键提示词（可选）"
                              help="会附加到系统提示词中，作为该 agent 的高优先级规则。"
                              style={{ marginBottom: 0 }}
                            >
                              <Input.TextArea
                                value={svc.prompt_override || ''}
                                onChange={(e) => updateService(index, { prompt_override: e.target.value })}
                                rows={5}
                                placeholder="例如：优先从 DBLP 抓取论文并按年份补全，不要使用网页导航链接作为论文条目。"
                              />
                            </Form.Item>
                          </Form>
                        ),
                      },
                    ]}
                  />
                </div>
              </Card>
            );
          })}
          {services.length === 0 && (
            <div style={{ color: '#999', fontSize: 13 }}>暂无 AI Agent 服务配置</div>
          )}

          {/* AI Classification Settings Card */}
          <Card
            size="small"
            bodyStyle={{ padding: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>AI自动分类</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <Collapse
                ghost
                items={[
                  {
                    key: 'classify-settings',
                    label: '设置',
                    children: (
                      <Form layout="vertical">
                        <Form.Item label="上下文字符数" help="发送给AI的论文内容字符数，越多越准确但消耗更多token" style={{ marginBottom: 12 }}>
                          <InputNumber
                            value={contextChars}
                            onChange={(v) => setContextChars(v || 1000)}
                            min={500}
                            max={5000}
                            step={100}
                            style={{ width: 200 }}
                          />
                        </Form.Item>
                        <Form.Item label="并发协程数" help="同时处理的论文数量" style={{ marginBottom: 12 }}>
                          <InputNumber
                            value={concurrency}
                            onChange={(v) => setConcurrency(v || 3)}
                            min={1}
                            max={10}
                            style={{ width: 200 }}
                          />
                        </Form.Item>
                        <Form.Item label="使用模型" style={{ marginBottom: 12 }}>
                          <Select
                            value={providerId || undefined}
                            onChange={(v) => setProviderId(v || '')}
                            placeholder="默认"
                            allowClear
                            style={{ width: 300 }}
                            options={[
                              ...providers.map((p) => ({
                                value: p.id,
                                label: `${p.name} (${p.model})${p.is_default ? ' - 默认' : ''}`,
                              })),
                            ]}
                          />
                        </Form.Item>
                        <Form.Item
                          label="目录生成提示词"
                          help="自定义AI生成目录结构时的提示词，留空使用默认"
                          style={{ marginBottom: 0 }}
                        >
                          <Input.TextArea
                            value={folderGenPrompt}
                            onChange={(e) => setFolderGenPrompt(e.target.value)}
                            placeholder="最多3级目录，目录标题要简洁明了，分类要合理且互不重叠，使用中文"
                            rows={4}
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                          />
                        </Form.Item>
                      </Form>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </div>
      </Spin>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} style={{ marginTop: 12 }}>
        保存
      </Button>
    </div>
  );
}

function TranslationSettings() {
  const [providerId, setProviderId] = useState('');
  const [prompt, setPrompt] = useState('请将以下文本翻译成中文，保持专业术语的准确性：');
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getTranslationSettings().catch(() => ({ data: { translation_provider_id: '', translation_prompt: '请将以下文本翻译成中文，保持专业术语的准确性：' } })),
      getAIProviders(),
    ])
      .then(([settingsRes, providersRes]) => {
        const settings = settingsRes.data as any;
        setProviderId(settings.translation_provider_id || '');
        setPrompt(settings.translation_prompt || '请将以下文本翻译成中文，保持专业术语的准确性：');

        const providerList = providersRes.data;
        setProviders(Array.isArray(providerList) ? providerList : []);
      })
      .catch((err) => {
        console.error('Failed to load translation settings:', err);
        message.error('加载设置失败');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        translation_enabled: true,
        translation_provider_id: providerId,
        translation_prompt: prompt,
      };
      console.log('[TranslationSettings] Saving:', data);
      const response = await saveTranslationSettings(data);
      console.log('[TranslationSettings] Save response:', response);
      message.success('翻译设置已保存');
    } catch (err: any) {
      console.error('[TranslationSettings] Save failed:', err);
      console.error('[TranslationSettings] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      message.error(`保存失败: ${err.response?.data?.detail || err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <div style={{ maxWidth: 600 }}>
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            在 PDF 阅读器工具栏中点击翻译图标即可开启/关闭划词翻译功能
          </div>
          <Form layout="vertical">
            <Form.Item label="使用模型" style={{ marginBottom: 12 }}>
              <Select
                value={providerId || undefined}
                onChange={(v) => setProviderId(v || '')}
                placeholder="使用默认模型"
                allowClear
                style={{ width: '100%' }}
                options={providers.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.model})${p.is_default ? ' - 默认' : ''}`,
                }))}
              />
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                留空则使用默认 AI 模型
              </div>
            </Form.Item>

            <Form.Item
              label="翻译提示词"
              help="自定义翻译时的提示词，AI 会根据此提示词进行翻译"
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="请将以下文本翻译成中文，保持专业术语的准确性："
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </Form.Item>
          </Form>
        </Card>

        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存
        </Button>
      </div>
    </Spin>
  );
}

export default function SettingsPage() {
  const tabItems = [
    {
      key: 'claude',
      label: 'Claude Code 连接',
      children: <ClaudeConnectionSettings />,
    },
    {
      key: 'mineru',
      label: 'MinerU 配置',
      children: <MinerUSettings />,
    },
    {
      key: 'ai',
      label: 'AI 服务配置',
      children: <AIProviderSettings />,
    },
    {
      key: 'summary',
      label: '总结提示词',
      children: <SummaryPromptSettings />,
    },
    {
      key: 'sync',
      label: '同步配置',
      children: <SyncSettings />,
    },
    {
      key: 'mcp',
      label: '🔧 搜索工具配置',
      children: <MCPToolsSettings />,
    },
    {
      key: 'agent-services',
      label: 'AI Agent 服务',
      children: <AgentServicesSettings />,
    },
    {
      key: 'translation',
      label: '划词翻译',
      children: <TranslationSettings />,
    },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <SettingOutlined style={{ marginRight: 8 }} />
        设置
      </Title>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
        <Tabs items={tabItems} />
      </div>
    </div>
  );
}
