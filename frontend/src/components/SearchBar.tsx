import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
}

export default function SearchBar({ value, onChange, onSearch }: SearchBarProps) {
  return (
    <Input
      placeholder="Search papers by title, author, or tag..."
      prefix={<SearchOutlined style={{ color: '#999' }} />}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPressEnter={() => onSearch(value)}
      allowClear
      onClear={() => onSearch('')}
      style={{ maxWidth: 480 }}
    />
  );
}
