import { useState, useEffect } from 'react';
import { Drawer, Checkbox, Button, InputNumber, Empty, Spin, Divider, Space, Typography } from 'antd';
import { ToolOutlined, SearchOutlined } from '@ant-design/icons';
import './ToolSelector.css';

const { Text } = Typography;

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon?: React.ReactNode;
}

interface ToolSelectorProps {
  paperId: number;
  open: boolean;
  onClose: () => void;
  selectedTools: string[];
  maxTurns: number;
  onConfirm: (tools: string[], maxTurns: number) => void;
  pageIndexExists?: boolean | null;
  pageIndexGenerating?: boolean;
  onGeneratePageIndex?: () => void;
  hasMarkdown?: boolean;
}

// Available tools (currently only PageIndex)
const AVAILABLE_TOOLS: Tool[] = [
  {
    id: 'pageindex_search',
    name: 'PageIndex 检索',
    description: '基于论文页面索引的智能检索工具，可以快速定位相关内容所在的页面',
    icon: <SearchOutlined style={{ color: '#1677ff' }} />,
  },
];

export default function ToolSelector({
  paperId,
  open,
  onClose,
  selectedTools,
  maxTurns,
  onConfirm,
  pageIndexExists,
  pageIndexGenerating,
  onGeneratePageIndex,
  hasMarkdown,
}: ToolSelectorProps) {
  const [localSelectedTools, setLocalSelectedTools] = useState<string[]>(selectedTools);
  const [localMaxTurns, setLocalMaxTurns] = useState<number>(maxTurns);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalSelectedTools(selectedTools);
      setLocalMaxTurns(maxTurns);
    }
  }, [open, selectedTools, maxTurns]);

  const handleConfirm = () => {
    onConfirm(localSelectedTools, localMaxTurns);
    onClose();
  };

  const handleCancel = () => {
    setLocalSelectedTools(selectedTools);
    setLocalMaxTurns(maxTurns);
    onClose();
  };

  return (
    <Drawer
      title={
        <Space>
          <ToolOutlined />
          <span>选择工具</span>
        </Space>
      }
      placement="right"
      width={400}
      open={open}
      onClose={handleCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确定
          </Button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : AVAILABLE_TOOLS.length === 0 ? (
        <Empty description="暂无可用工具" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              选择 Agent 可以使用的工具，启用工具后将自动切换到 Agent 模式
            </Text>
          </div>

          <Divider style={{ margin: '12px 0' }}>可用工具</Divider>

          <div className="tool-list">
            {AVAILABLE_TOOLS.map((tool) => {
              const isPageIndex = tool.id === 'pageindex_search';
              const needsGeneration = isPageIndex && pageIndexExists === false;
              const isGenerating = isPageIndex && pageIndexGenerating;
              const cannotUse = isPageIndex && !hasMarkdown;

              return (
                <div
                  key={tool.id}
                  className={`tool-card ${localSelectedTools.includes(tool.id) ? 'tool-card-selected' : ''} ${needsGeneration || cannotUse ? 'tool-card-disabled' : ''}`}
                  onClick={() => {
                    if (needsGeneration || cannotUse || isGenerating) return;
                    if (localSelectedTools.includes(tool.id)) {
                      setLocalSelectedTools(localSelectedTools.filter((t) => t !== tool.id));
                    } else {
                      setLocalSelectedTools([...localSelectedTools, tool.id]);
                    }
                  }}
                  style={{ cursor: needsGeneration || cannotUse || isGenerating ? 'default' : 'pointer' }}
                >
                  <Checkbox
                    checked={localSelectedTools.includes(tool.id)}
                    disabled={needsGeneration || cannotUse || isGenerating}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (needsGeneration || cannotUse || isGenerating) return;
                      if (e.target.checked) {
                        setLocalSelectedTools([...localSelectedTools, tool.id]);
                      } else {
                        setLocalSelectedTools(localSelectedTools.filter((t) => t !== tool.id));
                      }
                    }}
                  />
                  <div className="tool-card-content">
                    <div className="tool-card-header">
                      {tool.icon}
                      <span className="tool-card-name">{tool.name}</span>
                      {isPageIndex && pageIndexExists === true && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#52c41a' }}>✓ 已生成</span>
                      )}
                    </div>
                    <div className="tool-card-description">{tool.description}</div>
                    {isPageIndex && cannotUse && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#ff4d4f' }}>
                        需要先转换 PDF 为 Markdown
                      </div>
                    )}
                    {isPageIndex && needsGeneration && !cannotUse && (
                      <div style={{ marginTop: 8 }}>
                        <Button
                          type="primary"
                          size="small"
                          loading={isGenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            onGeneratePageIndex?.();
                          }}
                        >
                          {isGenerating ? '生成中...' : '生成 PageIndex'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Divider style={{ margin: '16px 0' }}>Agent 设置</Divider>

          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>最大轮次</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                Agent 最多执行的工具调用轮次
              </Text>
            </div>
            <InputNumber
              min={1}
              max={10}
              value={localMaxTurns}
              onChange={(val) => setLocalMaxTurns(val || 5)}
              style={{ width: '100%' }}
            />
          </div>

          {localSelectedTools.length > 0 && (
            <div className="tool-selector-info">
              <Text type="secondary" style={{ fontSize: 12 }}>
                已选择 {localSelectedTools.length} 个工具，Agent 模式将自动启用
              </Text>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
