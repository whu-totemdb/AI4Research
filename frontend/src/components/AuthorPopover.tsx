import React from 'react';
import type { AuthorInfo } from '../types';
import { useMarkdownSidebar } from '../hooks/useMarkdownSidebar';

interface AuthorPopoverProps {
  author: AuthorInfo;
  children: React.ReactNode;
}

const AuthorPopover: React.FC<AuthorPopoverProps> = ({ author, children }) => {
  const sidebar = useMarkdownSidebar();

  const handleClick = () => {
    // 直接使用 raw_markdown，它已经包含完整的结构化内容
    const markdown = author.raw_markdown || `# ${author.author_name}\n\n暂无详细信息`;
    sidebar.open(markdown, `${author.author_name} - 作者信息`);
  };

  return (
    <span onClick={handleClick} style={{ cursor: 'pointer' }}>
      {children}
    </span>
  );
};

export default AuthorPopover;
