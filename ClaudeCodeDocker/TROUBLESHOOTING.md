# Troubleshooting Guide

## Connection Refused Error (ERR_CONNECTION_REFUSED)

### Symptoms
- Container is running (`docker ps` shows it)
- Server logs show "Starting terminal server on 0.0.0.0:8000"
- Health check from inside container works: `docker exec claude-code-container curl http://localhost:8000/health`
- Connection from Windows host fails: `curl http://localhost:8650/health`

### Root Cause
This is a Docker networking issue on Windows, typically caused by:
1. Docker Desktop using WSL2 backend without proper port forwarding
2. Windows Firewall blocking the connection
3. Docker running on a remote host or VM without exposed ports

### Solutions

#### Solution 1: Check Docker Desktop Settings (Recommended)

1. Open Docker Desktop
2. Go to Settings → Resources → WSL Integration
3. Enable integration with your WSL2 distro
4. Go to Settings → General
5. Ensure "Use the WSL 2 based engine" is checked
6. Restart Docker Desktop

#### Solution 2: Use Docker Desktop Port Forwarding

If using WSL2, you may need to manually forward ports:

```powershell
# Run in PowerShell as Administrator
netsh interface portproxy add v4tov4 listenport=8650 listenaddress=0.0.0.0 connectport=8650 connectaddress=127.0.0.1
```

To remove the forwarding later:
```powershell
netsh interface portproxy delete v4tov4 listenport=8650 listenaddress=0.0.0.0
```

#### Solution 3: Access via WSL2 IP (If using WSL2)

1. Get WSL2 IP address:
   ```bash
   wsl hostname -I
   ```

2. Access the service using WSL2 IP:
   ```
   http://<WSL2_IP>:8650
   ```

#### Solution 4: Run Docker in WSL2 Directly

Instead of using Docker Desktop, run the installation script inside WSL2:

1. Open WSL2 terminal
2. Navigate to the project directory
3. Run: `./install.sh`
4. Access via: `http://localhost:8650`

#### Solution 5: Check Windows Firewall

1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules"
4. Create new rule for port 8650:
   - Rule Type: Port
   - Protocol: TCP
   - Port: 8650
   - Action: Allow the connection
   - PrAll
   - Name: Claude Code Docker

#### Solution 6: Use Different Port

Some ports may be blocked by Windows. Try a different port:

```bash
# Stop existing container
docker stop claude-code-container
docker rm claude-code-container

# Start with different port (e.g., 8080)
docker run -d --name claude-code-container \
  -p 8080:8000 \
  --memory=800m --cpus=2 \
  --restart unless-stopped \
  -v claude-workspace:/workspace \
  -e ANTHROPIC_AUTH_TOKEN="your-key" \
  -e ANTHROPIC_BASE_URL="https://api.anthropic.com" \
  claude-code-server:latest
```

### Verification Steps

1. **Check container is running:**
   ```bash
   docker ps | grep claude-code-container
   ```

2. **Check port mapping:**
   ```bash
   docker port claude-code-container
   ```
   Should show: `8000/tcp -> 0.0.0.0:8650`

3. **Test from inside container:**
   ```bash
   docker exec claude-code-container curl http://localhost:8000/health
   ```
   Should return: `{"status": "healthy"}`

4. **Check container logs:**
   ```bash
   docker logs claude-code-container
   ```
   Should show: "Starting terminal server on 0.0.0.0:8000"

5. **Test from Windows host:**
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 8650
   ```
   TcpTestSucceeded should be True

6. **Test HTTP connection:**
   ```powershell
   Invoke-WebRequest -Uri http://localhost:8650/health -UseBasicParsing
   ```

## Other Common Issues

### Container Exits Immediately

Check logs for errors:
```bash
docker logs claude-code-container
```

Common causes:
- Missing dependencies in Dockerfile
- Syntax error in entrypoint.sh
- Python script crashes on startup

### Port Already in Use

```bash
# Find what's using the port
netstat -ano | findstr :8650

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or use a different port
```

### Memory/CPU Limits Too Low

If the container is slow or crashes:
```bash
docker update --memory=1g --cpus=4 claude-code-container
docker restart claude-code-container
```

### API Key Not Working

1. Check environment variables:
   ```bash
   docker exec claude-code-container env | grep ANTHROPIC
   ```

2. Verify settings file:
   ```bash
   docker exec claude-code-container cat /root/.claude/settings.json
   ```

3. Update environment variables:
   ```bash
   docker stop claude-code-container
   docker rm claude-code-container
   # Run install script again with correct API key
   ```

## Getting Help

If none of these solutions work:

1. Collect diagnostic information:
   ```bash
   docker version
   docker info
   docker logs claude-code-container
   docker inspect claude-code-container
   docker port claude-code-container
   ```

2. Check Docker Desktop logs:
   - Open Docker Desktop
   - Click the bug icon (top right)
   - View logs

3. Test with minimal container:
   ```bash
   docker run -d -p 8650:8000 python:3.11-slim python -m http.server 8000
   curl http://localhost:8650
   ```
   If this works, the issue is with the Claude Code container.
   If this fails, the issue is with Docker networking on your system.
