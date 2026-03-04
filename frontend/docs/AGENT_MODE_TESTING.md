# Agent 模式集成测试指南

## 功能概述

Agent 模式允许 AI 在回答问题时自动调用工具（如 PageIndex 检索）来获取更准确的信息。

## 前端实现清单

### ✅ 已完成的功能

1. **工具选择界面** (`ToolSelector.tsx`)
   - 显示可用工具列表
   - 多选工具支持
   - 最大轮次设置
   - localStorage 持久化

2. **ChatPanel 集成**
   - Agent 模式自动切换
   - 工具调用过程显示
   - 思考过程展示
   - 错误处理

3. **消息类型扩展**
   - `ToolCall` 接口：工具调用信息
   - `ExtendedChatMessage`：支持工具调用和 Agent 模式标记
   - `parseAgentContent`：解析 Agent 响应

4. **UI 组件**
   - `ToolCallBlock`：工具调用展示块
   - `AgentStatusIndicator`：状态指示器
   - Agent 模式标识

5. **API 函数**
   - `generatePageIndex`：生成页面索引
   - `getPageIndexStatus`：获取索引状态
   - `searchPageIndex`：搜索页面索引
   - `chatWithTools`：Agent 模式对话

## 测试流程

### 1. 准备工作

1. 确保后端服务运行
2. 上传一篇论文并转换为 Markdown
3. 打开论文详情页

### 2. 启用 Agent 模式

1. 点击"添加工具"按钮
2. 选择"PageIndex 检索"工具
3. 设置最大轮次（默认 5）
4. 点击"确定"

### 3. 测试场景

#### 场景 1：首次使用（索引不存在）

**预期行为**：
- Agent 检测到索引不存在
- 自动调用生成索引工具
- 显示"正在生成页面索引..."
- 生成完成后继续检索

**测试问题**：
```
这篇论文的主要贡献是什么？
```

#### 场景 2：正常检索

**预期行为**：
- Agent 调用 PageIndex 检索工具
- 显示工具调用块（可展开查看输入/输出）
- 基于检索结果回答问题

**测试问题**：
```
论文中提到的实验结果在哪一页？
```

#### 场景 3：多轮工具调用

**预期行为**：
- Agent 可能多次调用工具
- 每次调用都显示独立的工具调用块
- 最终综合所有信息回答

**测试问题**：
```
请对比论文中第3节和第5节的方法差异
```

#### 场景 4：错误处理

**测试方法**：
- 删除 Markdown 文件
- 尝试使用 Agent 模式

**预期行为**：
- 显示错误提示
- 提示用户需要先转换 PDF

### 4. UI 验证

检查以下 UI 元素：

- [ ] "添加工具"按钮显示正常
- [ ] 工具选择抽屉打开/关闭正常
- [ ] 选中的工具以 Tag 形式显示
- [ ] Agent 模式标识显示（🤖 Agent 模式）
- [ ] 工具调用块样式正确
- [ ] 思考过程块可展开/折叠
- [ ] 错误提示清晰明确

### 5. 功能验证

- [ ] 工具选择持久化（刷新页面后保持）
- [ ] Agent 模式自动切换（选择工具时启用）
- [ ] 流式响应正常显示
- [ ] 工具调用结果正确解析
- [ ] 错误处理正确

## 预期的后端响应格式

### Agent 模式流式响应

```
data: {"chunk": "<think>我需要检索相关页面</think>"}
data: {"chunk": "<tool>{\"tool\":\"pageindex\",\"input\":\"主要贡献\",\"status\":\"running\"}</tool>"}
data: {"chunk": "<tool>{\"tool\":\"pageindex\",\"input\":\"主要贡献\",\"output\":\"找到3个相关页面...\",\"status\":\"success\"}</tool>"}
data: {"chunk": "根据检索结果，论文的主要贡献包括..."}
data: [DONE]
```

### 错误响应

```
data: {"error": "Markdown file not found. Please convert PDF first."}
```

## 常见问题排查

### 问题 1：工具调用不显示

**可能原因**：
- 后端未返回 `<tool>` 标签
- JSON 格式错误

**排查方法**：
- 检查浏览器控制台
- 查看网络请求响应

### 问题 2：Agent 模式未启用

**可能原因**：
- 未选择工具
- localStorage 未保存

**排查方法**：
- 检查 localStorage 中的 `paper_${paperId}_tools`
- 查看控制台日志

### 问题 3：索引生成失败

**可能原因**：
- Markdown 文件不存在
- 文件格式错误

**排查方法**：
- 检查 Markdown 文件是否存在
- 查看后端日志

## 文件清单

### 新增文件
- `frontend/src/components/ToolSelector.tsx`
- `frontend/src/components/ToolSelector.css`
- `frontend/src/components/AgentStatusIndicator.tsx`
- `frontend/docs/AGENT_MODE_TESTING.md`（本文件）

### 修改文件
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/components/ChatPanel.css`
- `frontend/src/api/index.ts`

## 下一步

等待后端实现 `/api/chat/agent` 端点后，进行端到端测试。
