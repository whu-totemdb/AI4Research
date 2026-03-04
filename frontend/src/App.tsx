import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ReaderPage from './pages/ReaderPage';
import SettingsPage from './pages/SettingsPage';
import { MarkdownSidebar } from './components';
import { MarkdownSidebarProvider, useMarkdownSidebar } from './contexts/MarkdownSidebarContext';

const theme = {
  token: {
    colorPrimary: '#1a73e8',
    borderRadius: 6,
  },
};

function MarkdownSidebarWrapper() {
  const sidebar = useMarkdownSidebar();
  return (
    <MarkdownSidebar
      isOpen={sidebar.isOpen}
      content={sidebar.content}
      title={sidebar.title}
      onClose={sidebar.close}
    />
  );
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <MarkdownSidebarProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="/reader" element={<ReaderPage />} />
            <Route path="/reader/:id" element={<ReaderPage />} />
          </Routes>
          <MarkdownSidebarWrapper />
        </BrowserRouter>
      </MarkdownSidebarProvider>
    </ConfigProvider>
  );
}
