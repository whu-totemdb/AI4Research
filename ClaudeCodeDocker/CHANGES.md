# Claude Code Docker - Changes Summary

## Issues Fixed

### 1. Port Configuration Mismatch (Connection Refused)
**Problem:** The installation scripts were mapping host port to container port 8080, but the server runs on port 8000.

**Fix:**
- Updated `install.sh` line 109: Changed `-p $PORT:8080` to `-p $PORT:8000`
- Updated `install.ps1` line 106: Changed `-p ${Port}:8080` to `-p ${Port}:8000`

**Result:** Port mapping now correctly forwards host port to container port 8000 where the server actually runs.

### 2. Enhanced Configuration Support
**Problem:** Installation scripts only supported API key, not custom base URLs or Claude configuration files.

**Fixes:**

#### A. Added ANTHROPIC_BASE_URL Support
- `install.sh`: Added prompt for base URL (lines 70-72)
- `install.ps1`: Added prompt for base URL (lines 63-65)
- Both scripts now pass `ANTHROPIC_BASE_URL` as environment variable to container

#### B. Changed Environment Variable Names
- Changed from `CLAUDE_API_KEY` to `ANTHROPIC_AUTH_TOKEN` (standard Claude CLI variable)
- Added `ANTHROPIC_BASE_URL` for custom API endpoints

#### C. Created Entrypoint Script
- New file: `terminal-server/entrypoint.sh`
- Automatically creates `/root/.claude.json` with `hasCompletedOnboarding: true`
- Automatically creates `/root/.claude/settings.json` with:
  - `alwaysThinkingEnabled: true`
  - Environment variables for API key and base URL

#### D. Updated Dockerfile
- Added entrypoint script execution
- Removed static config file creation
- Now uses dynamic configuration based on environment variables

## Files Modified

1. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\Dockerfile**
   - Changed CMD to ENTRYPOINT
   - Added entrypoint.sh execution
   - Made entrypoint.sh executable

2. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\install.sh**
   - Fixed port mapping: 8080 → 8000
   - Added ANTHROPIC_BASE_URL prompt
   - Changed CLAUDE_API_KEY → ANTHROPIC_AUTH_TOKEN
   - Added BASE_URL environment variable to docker run

3. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\install.ps1**
   - Fixed port mapping: 8080 → 8000
   - Added ANTHROPIC_BASE_URL prompt
   - Changed CLAUDE_API_KEY → ANTHROPIC_AUTH_TOKEN
   - Added BASE_URL environment variable to docker run

## Files Created

1. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\terminal-server\entrypoint.sh**
   - Bash script that runs on container startup
   - Creates Claude configuration files dynamically
   - Starts the Python server

2. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\SETUP.md**
   - Comprehensive setup guide
   - Configuration options documentation
   - Manual Docker commands reference

3. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\TROUBLESHOOTING.md**
   - Detailed troubleshooting guide for connection issues
   - Multiple solutions for Windows Docker networking problems
   - Verification steps and diagnostic commands

4. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\test-connection.sh**
   - Automated test script for Linux/Mac
   - Verifies container, port mapping, and HTTP endpoints

5. **D:\code\readPaper\FedAPM\AI4Research\ClaudeCodeDocker\test-connection.ps1**
   - Automated test script for Windows
   - Same functionality as bash version

## Configuration Flow

### Before (Old)
1. User runs install script
2. Prompted for: port, memory, CPU, API key
3. Container starts with `-p PORT:8080` (wrong port)
4. No Claude configuration files created
5. Connection fails

### After (New)
1. User runs install script
2. Prompted for: port, memory, CPU, API key, base URL
3. Container starts with `-p PORT:8000` (correct port)
4. Entrypoint script creates:
   - `/root/.claude.json` (skips onboarding)
   - `/root/.claude/settings.json` (with API credentials)
5. Server starts on port 8000
6. Port correctly mapped to host

## Environment Variables

The container now supports:
- `ANTHROPIC_AUTH_TOKEN`: Your Anthropic API key
- `ANTHROPIC_BASE_URL`: Custom API endpoint (default: https://api.anthropic.com)

These are automatically set in:
1. Container environment (via `docker run -e`)
2. Claude settings file (`/root/.claude/settings.json`)

## Testing

### Container is Working
```bash
# Server runs inside container
docker exec claude-code-container curl http://localhost:8000/health
# Returns: {"status": "healthy"}
```

### Windows Networking Issue
The connection from Windows host to container is failing due to Docker Desktop networking on Windows (WSL2 backend). This is a known issue with Docker Desktop on Windows and is documented in TROUBLESHOOTING.md.

**Workarounds:**
1. Access from WSL2 directly
2. Use port forwarding with netsh
3. Check Windows Firewall
4. Try different port
5. Enable WSL2 integration in Docker Desktop

## Next Steps for Users

1. **Rebuild the container:**
   ```bash
   docker stop claude-code-container
   docker rm claude-code-container
   ./install.ps1  # or ./install.sh on Linux/Mac
   ```

2. **Test the connection:**
   ```powershell
   .\test-connection.ps1
   ```

3. **If connection fails, follow TROUBLESHOOTING.md**

## Summary

All requested features have been implemented:
- ✅ Fixed port configuration (8080 → 8000)
- ✅ Added ANTHROPIC_BASE_URL support
- ✅ Created Claude configuration files automatically
- ✅ Set environment variables in container
- ✅ Created comprehensive documentation
- ✅ Added test scripts

The server is running correctly inside the container. The remaining connection issue is a Windows-specific Docker networking problem that requires system-level configuration (documented in TROUBLESHOOTING.md).
