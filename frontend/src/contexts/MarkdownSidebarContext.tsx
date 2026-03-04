import React, { createContext, useContext, useState, useCallback } from 'react';

export interface MarkdownSidebarState {
  isOpen: boolean;
  content: string;
  title?: string;
}

export interface MarkdownSidebarControls {
  open: (content: string, title?: string) => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
  content: string;
  title?: string;
}

const MarkdownSidebarContext = createContext<MarkdownSidebarControls | undefined>(undefined);

export function MarkdownSidebarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MarkdownSidebarState>({
    isOpen: false,
    content: '',
    title: undefined,
  });

  const open = useCallback((content: string, title?: string) => {
    setState({
      isOpen: true,
      content,
      title,
    });
  }, []);

  const close = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const toggle = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: !prev.isOpen,
    }));
  }, []);

  const value: MarkdownSidebarControls = {
    open,
    close,
    toggle,
    isOpen: state.isOpen,
    content: state.content,
    title: state.title,
  };

  return (
    <MarkdownSidebarContext.Provider value={value}>
      {children}
    </MarkdownSidebarContext.Provider>
  );
}

export function useMarkdownSidebar(): MarkdownSidebarControls {
  const context = useContext(MarkdownSidebarContext);
  if (!context) {
    throw new Error('useMarkdownSidebar must be used within MarkdownSidebarProvider');
  }
  return context;
}
