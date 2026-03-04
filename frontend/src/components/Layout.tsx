import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu } from 'antd';
import {
  HomeOutlined,
  SettingOutlined,
  ReadOutlined,
  BookOutlined,
} from '@ant-design/icons';

const { Header, Content } = AntLayout;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentKey = location.pathname.startsWith('/settings')
    ? '/settings'
    : location.pathname.startsWith('/reader')
      ? '/reader'
      : '/';

  return (
    <AntLayout style={{ minHeight: '100vh', minWidth: 1200 }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 24px',
          height: 56,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            marginRight: 32,
          }}
          onClick={() => navigate('/')}
        >
          <ReadOutlined style={{ fontSize: 22, color: '#1a73e8' }} />
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1a73e8' }}>
            AI4Research
          </span>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[currentKey]}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, border: 'none' }}
          items={[
            { key: '/', icon: <HomeOutlined />, label: '论文库' },
            { key: '/reader', icon: <BookOutlined />, label: '阅读模式' },
            { key: '/settings', icon: <SettingOutlined />, label: '设置' },
          ]}
        />
      </Header>
      <Content style={{ background: '#f5f6f8' }}>
        <Outlet />
      </Content>
    </AntLayout>
  );
}
