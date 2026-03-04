export interface Paper {
  id: number;
  title: string;
  authors: string;
  abstract: string;
  file_path: string;
  paper_dir: string | null;
  has_markdown: boolean;
  venue: string | null;
  publish_date: string | null;
  brief_note: string | null;
  folder_id: number | null;  // keep for backward compat
  folder_ids: number[];
  folders: { id: number; name: string }[];
  tags: string;
  importance?: number;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  children?: Folder[];
}

export interface Note {
  id: number;
  paper_id: number;
  content: string;
  page_number: number | null;
  selection_text: string | null;
  note_type: string;
  color: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchResult {
  matched_section: string | null;
  context_before: string;
  context_after: string;
  confidence: number;
}

export interface SyncConfig {
  server_url: string;
  username: string;
  password: string;
  sync_directory: string;
  last_sync_at: string | null;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface AIProvider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  model: string;
  is_default: boolean;
  provider_type: 'openai' | 'claude';
  thinking_budget?: number;
}

export interface PaperFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface PaperReference {
  id: number;
  source_paper_id: number;
  target_paper_id: number;
  source_page: number | null;
  description: string | null;
  created_at: string;
  target_paper?: Paper;
}

export interface AuthorInfo {
  id: number;
  paper_id: number;
  author_name: string;
  affiliation: string | null;
  research_areas: string | null;
  notable_works: string | null;
  profile_links: string | null;
  relationship_to_paper: string | null;
  raw_markdown: string;
  explored_at: string;
}

export interface AskClaudeRequest {
  selected_text: string;
  question: string;
  matched_markdown: string | null;
}

export interface AgentServiceConfig {
  id: string;
  name: string;
  enabled: boolean;
  enabled_tools: string[];
  tool_priority?: Record<string, number>;
  prompt_override: string;
}
