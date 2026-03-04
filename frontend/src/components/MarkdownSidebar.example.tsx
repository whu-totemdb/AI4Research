/**
 * MarkdownSidebar 使用示例
 *
 * 这个文件展示了如何在项目中使用 MarkdownSidebar 组件
 */

import { useState } from 'react';
import { Button } from 'antd';
import MarkdownSidebar from './MarkdownSidebar';
import { useMarkdownSidebar } from '../hooks/useMarkdownSidebar';

// 示例 1: 使用 Hook 方式（推荐）
export function Example1() {
  const sidebar = useMarkdownSidebar();

  const sampleMarkdown = `
# 示例文档

这是一个 **Markdown** 文档示例。

## 功能特性

- 支持 GFM (GitHub Flavored Markdown)
- 支持数学公式渲染
- 代码高亮
- 表格支持

## 代码示例

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

## 数学公式

行内公式: $E = mc^2$

块级公式:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## 表格

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| A   | B   | C   |
| 1   | 2   | 3   |
`;

  return (
    <div>
      <Button onClick={() => sidebar.open(sampleMarkdown, '示例文档')}>
        打开 Markdown 侧边栏
      </Button>

      <MarkdownSidebar
        isOpen={sidebar.isOpen}
        content={sidebar.content}
        title={sidebar.title}
        onClose={sidebar.close}
      />
    </div>
  );
}

// 示例 2: 使用 State 方式
export function Example2() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  const openSidebar = (mdContent: string, mdTitle: string) => {
    setContent(mdContent);
    setTitle(mdTitle);
    setIsOpen(true);
  };

  return (
    <div>
      <Button onClick={() => openSidebar('# Hello\n\nThis is content', 'My Document')}>
        打开侧边栏
      </Button>

      <MarkdownSidebar
        isOpen={isOpen}
        content={content}
        title={title}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}

// 示例 3: 从 API 加载内容
export function Example3() {
  const sidebar = useMarkdownSidebar();

  const loadMarkdownFromApi = async (fileId: string) => {
    try {
      // 假设有一个 API 端点返回 markdown 内容
      const response = await fetch(`/api/markdown/${fileId}`);
      const data = await response.json();

      sidebar.open(data.content, data.title);
    } catch (error) {
      console.error('Failed to load markdown:', error);
    }
  };

  return (
    <div>
      <Button onClick={() => loadMarkdownFromApi('doc-123')}>
        加载文档
      </Button>

      <MarkdownSidebar
        isOpen={sidebar.isOpen}
        content={sidebar.content}
        title={sidebar.title}
        onClose={sidebar.close}
      />
    </div>
  );
}

// 示例 4: 自定义宽度
export function Example4() {
  const sidebar = useMarkdownSidebar();

  return (
    <div>
      <Button onClick={() => sidebar.open('# Custom Width\n\nThis sidebar is wider!', 'Wide Document')}>
        打开宽侧边栏
      </Button>

      <MarkdownSidebar
        isOpen={sidebar.isOpen}
        content={sidebar.content}
        title={sidebar.title}
        onClose={sidebar.close}
        width="60%"  // 自定义宽度
      />
    </div>
  );
}

// 示例 5: 在现有页面中集成
export function IntegrationExample() {
  const sidebar = useMarkdownSidebar();

  // 模拟点击某个文件时打开侧边栏
  const handleFileClick = (fileName: string, fileContent: string) => {
    sidebar.open(fileContent, fileName);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 主内容区 */}
      <div style={{
        flex: 1,
        padding: 20,
        transition: 'margin-right 0.3s ease',
        marginRight: sidebar.isOpen ? '45%' : 0  // 主内容区自动收缩
      }}>
        <h1>文件列表</h1>
        <ul>
          <li>
            <a onClick={() => handleFileClick('README.md', '# README\n\nProject documentation...')}>
              README.md
            </a>
          </li>
          <li>
            <a onClick={() => handleFileClick('GUIDE.md', '# Guide\n\nUser guide...')}>
              GUIDE.md
            </a>
          </li>
        </ul>
      </div>

      {/* Markdown 侧边栏 */}
      <MarkdownSidebar
        isOpen={sidebar.isOpen}
        content={sidebar.content}
        title={sidebar.title}
        onClose={sidebar.close}
      />
    </div>
  );
}
