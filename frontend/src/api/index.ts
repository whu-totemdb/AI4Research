import axios from 'axios';
import type { Folder, Paper, Note, SyncConfig, PaperReference, MatchResult, AskClaudeRequest, AIProvider, AuthorInfo, AgentServiceConfig } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Folders
export const getFolders = () => api.get<Folder[]>('/folders');
export const createFolder = (data: { name: string; parent_id: number | null }) =>
  api.post<Folder>('/folders', data);
export const updateFolder = (id: number, data: { name: string }) =>
  api.put<Folder>(`/folders/${id}`, data);
export const deleteFolder = (id: number) => api.delete(`/folders/${id}`);

// Papers
export const getPapers = (folderId?: number | null) => {
  const params: Record<string, any> = {};
  if (folderId !== null && folderId !== undefined) {
    params.folder_id = folderId;
  }
  return api.get<Paper[]>('/papers', { params });
};
export const getPaper = (id: number) => api.get<Paper>(`/papers/${id}`);
export const uploadPaper = (formData: FormData) =>
  api.post<Paper>('/papers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const updatePaper = (id: number, data: Partial<Paper>) =>
  api.put<Paper>(`/papers/${id}`, data);
export const deletePaper = (id: number) => api.delete(`/papers/${id}`);
export const searchPapers = (query: string) =>
  api.get<Paper[]>('/papers', { params: { search: query } });

// Notes
export const getNotes = (paperId: number) =>
  api.get<Note[]>('/notes', { params: { paper_id: paperId } });
export const createNote = (data: {
  paper_id: number;
  content: string;
  selected_text?: string;
  page_number?: number | null;
  note_type?: string;
  color?: string | null;
  position_data?: any;
}) => api.post<Note>('/notes', data);
export const updateNote = (id: number, data: {
  content?: string;
  color?: string | null;
  note_type?: string;
}) =>
  api.put<Note>(`/notes/${id}`, data);
export const deleteNote = (id: number) => api.delete(`/notes/${id}`);

// Sync
export const getSyncConfig = () => api.get<SyncConfig>('/sync/config');
export const saveSyncConfig = (data: Omit<SyncConfig, 'last_sync_at'>) =>
  api.post<SyncConfig>('/sync/config', data);
export const testSyncConnection = (data: Omit<SyncConfig, 'last_sync_at'>) =>
  api.post<{ success: boolean; message: string }>('/sync/test', data);
export const triggerSync = () => api.post<{ message: string }>('/sync/trigger');

// Importance
export const updateImportance = (paperId: number, importance: number) =>
  api.put(`/papers/${paperId}/importance`, { importance });

// Markdown
export const uploadMarkdown = (paperId: number, content: string) =>
  api.post(`/papers/${paperId}/markdown`, { content });
export const getMarkdown = (paperId: number) =>
  api.get<{ content: string }>(`/papers/${paperId}/markdown`);

// Text matching
export const matchText = (paperId: number, selectedText: string) =>
  api.post<MatchResult>(`/papers/${paperId}/match-text`, { selected_text: selectedText });

// References
export const getReferences = (paperId: number) =>
  api.get<PaperReference[]>(`/papers/${paperId}/references`);
export const createReference = (data: { source_paper_id: number; target_paper_id: number; source_page?: number; description?: string }) =>
  api.post<PaperReference>('/references', data);
export const deleteReference = (id: number) =>
  api.delete(`/references/${id}`);

// Ask Claude (SSE streaming)
export const askClaude = async function* (paperId: number, request: AskClaudeRequest) {
  const response = await fetch(`/api/papers/${paperId}/ask-claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to ask Claude');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) yield parsed.chunk;
          if (parsed.done && parsed.note_id) yield { note_id: parsed.note_id };
        } catch {
          yield data;
        }
      }
    }
  }
};

// Settings
export const getSettings = () => api.get('/settings');
export const getSetting = (key: string) => api.get(`/settings/${key}`);
export const updateSetting = (key: string, value: string) => api.put(`/settings/${key}`, { value });
export const getAIProviders = () => api.get<AIProvider[]>('/settings/ai-providers');
export const saveAIProviders = (providers: AIProvider[]) => api.post('/settings/ai-providers', providers);
export const getAgentServices = () => api.get<AgentServiceConfig[]>('/settings/agent-services');
export const saveAgentServices = (services: AgentServiceConfig[]) => api.post('/settings/agent-services', services);

export const extractMetadata = (paperId: number) => api.post('/papers/' + paperId + '/extract-metadata');

// MCP Tools
export const getMCPTools = () => api.get('/mcp-tools');
export const testMCPTool = (toolName: string) => api.post(`/mcp-tools/${toolName}/test`);

// Paper files
export const getPaperFiles = (paperId: number) => api.get(`/papers/${paperId}/files`);
export const setPaperFolders = (paperId: number, folderIds: number[]) =>
  api.post(`/papers/${paperId}/folders`, { folder_ids: folderIds });

// MinerU conversion
export const convertPdfToMd = (paperId: number, autoExtract: boolean = false) =>
  api.post(`/papers/${paperId}/convert-md`, null, { params: { auto_extract: autoExtract } });
export const getConvertStatus = (paperId: number, taskId: string) =>
  api.get(`/papers/${paperId}/convert-md/status`, { params: { task_id: taskId } });

// Chat stream
export interface ChatStreamRequest {
  paper_id: number;
  question: string;
  selected_text: string | null;
  matched_markdown: string | null;
  context_files: string[];
  provider_id: string | null;
  history: { role: string; content: string }[];
}

export const chatStream = async function* (body: ChatStreamRequest) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Chat request failed');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) yield parsed.chunk;
          if (parsed.done) return;
        } catch { /* skip */ }
      }
    }
  }
};

// Summary
export const getSummary = (paperId: number) =>
  api.get<{ content: string }>(`/papers/${paperId}/summary`);

export const generateSummary = async function* (paperId: number) {
  const response = await fetch(`/api/papers/${paperId}/summary/generate`, { method: 'POST' });
  if (!response.ok) throw new Error('Summary generation failed');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) yield parsed.chunk;
        } catch { /* skip */ }
      }
    }
  }
};

// Author exploration
export const getAuthorInfos = (paperId: number) =>
  api.get<AuthorInfo[]>(`/papers/${paperId}/authors`);

// Classify
export const classifyPaper = (paperId: number, data?: { provider_id?: string; context_chars?: number }) =>
  api.post(`/classify/paper/${paperId}`, data || {});

export const classifyPapersBatch = async function* (data: { paper_ids: number[]; provider_id?: string; context_chars?: number; concurrency?: number }) {
  const response = await fetch('/api/classify/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Batch classify failed');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const d = line.slice(6);
        if (d === '[DONE]') return;
        try { yield JSON.parse(d); } catch { /* skip */ }
      }
    }
  }
};

export const generateFolderProposals = (data?: { provider_id?: string; custom_prompt?: string }) =>
  api.post('/classify/generate-folders', data || {}, { timeout: 120000 });

export const applyFolderProposal = async function* (data: { proposal: any; reclassify?: boolean; provider_id?: string; context_chars?: number; concurrency?: number }) {
  const response = await fetch('/api/classify/apply-folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Apply folders failed');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const d = line.slice(6);
        if (d === '[DONE]') return;
        try { yield JSON.parse(d); } catch { /* skip */ }
      }
    }
  }
};

// Classify settings
export const getClassifySettings = () => api.get('/settings/classify');
export const saveClassifySettings = (data: { classify_context_chars: number; classify_concurrency: number; classify_provider_id: string; folder_gen_prompt: string }) =>
  api.put('/settings/classify', data);

// Translation settings
export const getTranslationSettings = () => api.get('/settings/translation');
export const saveTranslationSettings = (data: { translation_enabled: boolean; translation_provider_id: string; translation_prompt: string }) =>
  api.put('/settings/translation', data);

// Translation stream
export const translateStream = async function* (text: string, providerId?: string) {
  const response = await fetch('/api/translate/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, provider_id: providerId }),
  });
  if (!response.ok) throw new Error('Translation request failed');
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.chunk) yield parsed.chunk;
          if (parsed.done) return;
        } catch { /* skip */ }
      }
    }
  }
};

// PageIndex API
export const searchPageIndex = (paperId: number, query: string, topK: number = 5) =>
  api.post(`/papers/${paperId}/pageindex/search`, { query, top_k: topK });

// PageIndex management
export const getPageIndexStatus = (paperId: number) =>
  api.get<{ exists: boolean; reason?: string }>(`/papers/${paperId}/pageindex/status`);

// PageIndex generation with streaming
export async function* generatePageIndexStream(
  paperId: number,
  model?: string,
  providerId?: string | null
): AsyncGenerator<{ status?: string; message?: string; error?: string; index_path?: string }, void, unknown> {
  const response = await fetch(`/api/papers/${paperId}/pageindex/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'gpt-4o-2024-11-20',
      provider_id: providerId || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate PageIndex: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch (e) {
          console.error('Failed to parse SSE data:', data);
        }
      }
    }
  }
}

export const generatePageIndex = (paperId: number, model?: string, providerId?: string | null) =>
  api.post<{ success: boolean; index_path: string }>(`/papers/${paperId}/pageindex/generate`, {
    model: model || 'gpt-4o-2024-11-20',
    provider_id: providerId || null,
  });

// Agent mode chat with tools
export interface ChatWithToolsRequest {
  paper_id: number;
  question: string;
  selected_text: string | null;
  matched_markdown: string | null;
  context_files: string[];
  provider_id: string | null;
  history: { role: string; content: string }[];
  tools: string[];
  max_turns: number;
}

export const chatWithTools = async function* (body: ChatWithToolsRequest) {
  const response = await fetch('/api/chat/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Agent chat request failed: ${response.status} ${errorText}`);
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) yield parsed.chunk;
          if (parsed.done) return;
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
            throw e;
          }
        }
      }
    }
  }
};

export default api;
