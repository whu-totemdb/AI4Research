# Claude Code Docker Setup Guide

## Quick Start

### Windows
```powershell
.\install.ps1
```

### Linux/Mac
```bash
chmod +x install.sh
./install.sh
```

## Configuration Options

During installation, you'll be prompted for:

1. **Port** (default: 8080)
   - The port where the service will be accessible
   - Example: 8650

2. **Memory Limit** (default: 800m)
   - Container memory limit
   - Format: number + m/M/g/G
   - Example: 800m, 1g, 2G

3. **CPU Cores** (default: 2)
   - Number of CPU cores allocated
   - Example: 2, 4, 0.5

4. **Claude API Key** (optional)
   - Your Anthropic API key
   - Can be skipped if using a proxy

5. **Anthropic Base URL** (default: https://api.anthropic.com)
   - Custom API endpoint
   - Useful for proxy services or custom deployments
   - Example: https://new-api.yuyugod.top

## What Gets Configured

The installation automatically:

1. Creates Claude configuration files inside the container:
   - `/root/.claude.json` - Marks onboarding as completed
   - `/root/.claude/settings.json` - Contains API settings

2. Sets environment variables:
   - `ANTHROPIC_AUTH_TOKEN` - Your API key
   - `ANTHROPIC_BASE_URL` - API endpoint URL

3. Enables features:
   - `alwaysThinkingEnabled: true` - Enhanced thinking mode

## Troubleshooting

### Connection Refused Error

If you get `ERR_CONNECTION_REFUSED`:

1. Check if container is running:
   ```bash
   docker ps | grep claude-code-container
   ```

2. Check container logs:
   ```bash
   docker logs claude-code-container
   ```

3. Verify port mapping:
   ```bash
   docker port claude-code-container
   ```
   Should show: `8000/tcp -> 0.0.0.0:YOUR_PORT`

4. Test health endpoint:
   ```bash
   curl http://localhost:YOUR_PORT/health
   ```

### Rebuild After Changes

If you need to rebuild with new configuration:

```bash
# Stop and remove existing container
docker stop claude-code-container
docker rm claude-code-container

# Run installation script again
./install.sh  # or install.ps1 on Windows
```

## Manual Docker Commands

### View Logs
```bash
docker logs -f claude-code-container
```

### Stop Container
```bash
docker stop claude-code-container
```

### Start Container
```bash
docker start claude-code-container
```

### Restart Container
```bash
docker restart claude-code-container
```

### Remove Container
```bash
docker stop claude-code-container
docker rm claude-code-container
```

### Remove Everything (including workspace)
```bash
docker stop claude-code-container
docker rm claude-code-container
docker volume rm claude-workspace
```

## Port Configuration

The server runs on port 8000 inside the container. The installation script maps this to your chosen host port.

Example: If you choose port 8650 during installation:
- Container: `0.0.0.0:8000`
- Host: `localhost:8650`
- Mapping: `-p 8650:8000`

## Security Features

The container runs with:
- No new privileges
- Minimal capabilities (only CHOWN, SETUID, SETGID)
- Memory and CPU limits
- Isolated workspace volume
- Auto-restart unless stopped manually
