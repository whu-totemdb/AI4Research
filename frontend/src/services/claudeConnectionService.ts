export interface ClaudeConnectionConfig {
  mode: 'docker' | 'local';
  dockerUrl?: string;
}

const STORAGE_KEY = 'claude_connection_config';

export const getConnectionConfig = (): ClaudeConnectionConfig => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return { mode: 'docker', dockerUrl: 'http://localhost:8080' };
    }
  }
  return { mode: 'docker', dockerUrl: 'http://localhost:8080' };
};

export const saveConnectionConfig = (config: ClaudeConnectionConfig): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const testDockerConnection = async (url: string): Promise<{ success: boolean; message: string }> => {
  // Try multiple URL variations for Windows Docker compatibility
  const urlsToTry = [
    url,
    url.replace('localhost', '127.0.0.1'),
    url.replace('localhost', 'host.docker.internal'),
  ];

  for (const testUrl of urlsToTry) {
    try {
      const response = await fetch(`${testUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
      });

      if (response.ok) {
        // Save the working URL for future use
        const config = getConnectionConfig();
        if (config.dockerUrl !== testUrl) {
          saveConnectionConfig({ ...config, dockerUrl: testUrl });
        }
        return { success: true, message: 'Connection successful' };
      }
    } catch (error) {
      // Try next URL
      continue;
    }
  }

  return {
    success: false,
    message: 'Failed to connect. Please ensure Docker container is running and accessible.'
  };
};

export const getWebSocketUrl = (sessionId: string): string => {
  const config = getConnectionConfig();

  if (config.mode === 'docker' && config.dockerUrl) {
    const url = new URL(config.dockerUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws/${sessionId}`;
  }

  // Local mode - connect to backend WebSocket at /ws/terminal/{sessionId}
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/terminal/${sessionId}`;
};

export interface CreateSessionResponse {
  sessionId: string;
  mode?: string;
  securityWarning?: string;
}

export const createSession = async (paperId?: number): Promise<CreateSessionResponse> => {
  const config = getConnectionConfig();

  if (config.mode === 'docker' && config.dockerUrl) {
    const response = await fetch(`${config.dockerUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_id: paperId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const data = await response.json();
    return { sessionId: data.session_id, mode: 'docker' };
  }

  // Local mode - create session via backend at /api/terminal/sessions
  const response = await fetch('/api/terminal/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paper_id: paperId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  return await response.json();
};
