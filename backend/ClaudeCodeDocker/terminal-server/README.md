# Claude Code Terminal Server

A FastAPI-based terminal server that runs inside Docker containers to manage Claude Code sessions with bubblewrap sandboxing.

## Architecture

### Components

1. **FastAPI Application**: Handles HTTP REST API and WebSocket connections
2. **ClaudeSession Manager**: Manages individual Claude Code instances with sandboxing
3. **Bubblewrap Sandboxing**: Restricts Claude Code access to workspace directories only
4. **WebSocket Handler**: Provides real-time terminal I/O over WebSocket connections

### Security Model

Each Claude Code session runs in a bubblewrap sandbox with:
- Read-only access to system directories (/usr, /lib, /bin, /etc)
- Read-write access only to session-specific workspace (/workspace/{session_id})
- Network sharing enabled for API calls
- Process isolation with --unshare-all
- Automatic cleanup on parent process death

## API Endpoints

### REST API

**POST /api/sessions**
- Creates a new Claude Code session
- Returns session_id and workspace_path
- Automatically starts sandboxed Claude Code instance

**DELETE /api/sessions/{session_id}**
- Destroys a Claude Code session
- Cleans up workspace directory
- Terminates all associated processes

**POST /api/upload/{folder}**
- Uploads files to workspace folder
- Accepts multipart form data with multiple files
- Creates directories as needed

**GET /api/files/{folder}**
- Lists all files in workspace folder
- Returns file names, paths, and sizes
- Recursively scans subdirectories

**GET /api/health**
- Health check endpoint
- Returns active session count and session IDs

### WebSocket

**WS /ws/terminal/{session_id}**
- Bidirectional terminal I/O
- Receives user input and sends to Claude Code stdin
- Broadcasts Claude Code stdout/stderr to all connected clients
- Supports multiple concurrent WebSocket connections per session

## Session Lifecycle

1. **Creation**: POST /api/sessions creates workspace and starts sandboxed Claude Code
2. **Connection**: WebSocket clients connect to /ws/terminal/{session_id}
3. **Interaction**: Bidirectional communication via WebSocket
4. **Cleanup**: DELETE /api/sessions or server shutdown terminates process and removes workspace

## Running the Server

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python server.py
```

Server listens on port 8000 with CORS enabled for all origins.

## Logging

All operations are logged with timestamps for debugging:
- Session creation/destruction
- WebSocket connections/disconnections
- File uploads
- Errors and exceptions
