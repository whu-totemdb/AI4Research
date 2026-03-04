# Terminal Server

HTTP-based terminal server for executing commands in the Docker environment.

## API Endpoints

### POST /execute
Execute a shell command in the workspace.

**Request:**
```json
{
  "command": "ls -la"
}
```

**Response:**
```json
{
  "stdout": "...",
  "stderr": "...",
  "returncode": 0
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

## Development

Install dependencies:
```bash
pip install -r requirements.txt
```

Run the server:
```bash
python server.py
```
