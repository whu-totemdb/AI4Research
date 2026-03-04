# ClaudeCodeDocker - Isolated Claude Code Environment (Linux Only)

## Overview

ClaudeCodeDocker provides a secure, isolated Docker environment for running Claude Code operations on Linux systems. All Claude Code operations run inside a sandboxed Docker container with controlled access to your workspace.

### Why Use Docker Isolation?

- **Security**: Commands execute in an isolated container with Bubblewrap sandboxing, protecting your host system
- **Consistency**: Same environment across different Linux machines
- **Control**: Limit resource usage (CPU, memory) with configurable limits
- **Separation**: Keep AI operations separate from your main development environment
- **Easy Cleanup**: Remove the entire environment with a single command

## System Requirements

### Supported Platforms

- ✅ **Linux** (Ubuntu, Debian, CentOS, Fedora, etc.)
- ✅ **macOS** (with Docker Desktop)
- ❌ **Windows** - Not supported due to Docker Desktop networking issues

### Why Not Windows?

Docker Desktop on Windows has persistent port forwarding issues that prevent reliable container access. We recommend Linux users or using WSL2 with native Linux Docker installation.

## Quick Start

### One-Command Installation

**Linux/Mac:**
```bash
cd ClaudeCodeDocker
chmod +x install.sh
./install.sh
```

The installation script will:
1. ✅ Check Docker installation
2. ✅ Prompt for configuration (port, memory, CPU cores)
3. ✅ Build the Docker image
4. ✅ Start the container automatically
5. ✅ Verify connection
6. ✅ Display the connection URL

**Default Configuration:**
- Port: 8080
- Memory: 800MB
- CPU Cores: 2

After installation, the terminal server will be available at `http://localhost:8080`

## Installation Guide

### Prerequisites

Before installing, ensure you have:

1. **Docker Engine** (Linux) or **Docker Desktop** (Mac)
   - Linux: `curl -fsSL https://get.docker.com | sh`
   - Mac: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

2. **Verify Installation:**
   ```bash
   docker --version
   ```

### Installation Steps

1. Open Terminal
2. Navigate to the ClaudeCodeDocker directory:
   ```bash
   cd path/to/AI4Research/ClaudeCodeDocker
   ```

3. Make the script executable and run it:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

4. Follow the interactive prompts:
   - Port [8080]: Press Enter for default or enter custom port
   - Memory limit [800m]: Press Enter for default or enter custom (e.g., 1g, 2g)
   - CPU cores [2]: Press Enter for default or enter custom number
   - Claude API Key: Optional, press Enter to skip

5. The script will automatically build and start the container
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

4. Follow the interactive prompts

## Configuration Options

The installation script prompts for the following configuration options:

### Port Selection

**Default: 8080**

The port where the terminal server will be accessible. Choose a different port if 8080 is already in use.

```
Port [8080]: 8080
```

Access the server at `http://localhost:8080`

### Memory Limit

**Default: 800m**

Maximum memory the container can use. Format: `<number><unit>` where unit is `m` (megabytes) or `g` (gigabytes).

Examples:
- `800m` - 800 megabytes (default)
- `1g` - 1 gigabyte
- `2g` - 2 gigabytes

```
Memory limit [800m]: 1g
```

### CPU Cores

**Default: 2**

Number of CPU cores the container can use. Can be a decimal number (e.g., 1.5).

```
CPU cores [2]: 4
```

### Claude API Key

**Optional**

Your Anthropic API key for Claude Code. Press Enter to skip if you'll configure it later.

```
Claude API Key (optional, press Enter to skip): sk-ant-api03-...
```

You can also set it later using:
```bash
docker stop claude-code-container
docker rm claude-code-container
# Re-run install.sh with the API key
```

## Usage

### Getting the Connection URL

After installation completes, the script displays your connection URL:

```
📍 Connection URLs:
  Local:   http://localhost:8080
  Network: http://192.168.1.100:8080
```

Use the **Local** URL if accessing from the same machine.
Use the **Network** URL if accessing from another device on the same network.

### Configuring in Frontend

1. Open the AI4Research frontend application
2. Navigate to **Settings** → **Claude Code 连接**
3. Select **Docker 模式（推荐）**
4. Enter the connection URL: `http://localhost:8080`
5. Click **测试连接** to verify
6. Click **保存配置**

### File Upload/Download

The Docker container has an isolated `/workspace` directory. Files uploaded through the frontend will be stored here and accessible to Claude Code.

- **Upload files**: Place them in the workspace directory on your host
- **Download files**: Files created by Claude Code appear in the workspace directory
- **Real-time sync**: Changes are immediately visible in both container and host

Example workspace structure:
```
workspace/
├── papers/
│   └── paper1.pdf
├── notes/
│   └── notes.md
└── code/
    └── analysis.py
```

## Architecture

### Docker Isolation Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Host Machine                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │         AI4Research Frontend (Browser)             │ │
│  │                                                     │ │
│  │  [Settings: Docker Mode]                           │ │
│  │  Connection: http://localhost:8080                 │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│                         │ HTTP/WebSocket                 │
│                         ▼                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Docker Container (Isolated)                │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │   Terminal Server (Python)                   │ │ │
│  │  │   - Receives commands via HTTP               │ │ │
│  │  │   - Executes in sandboxed environment        │ │ │
│  │  │   - Returns output                            │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │   Workspace Volume (Mounted)                 │ │ │
│  │  │   /workspace → ./workspace                   │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                         ▲                                │
│                         │                                │
│                         │ Volume Mount                   │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │   Host Workspace Directory                          │ │
│  │   ./workspace/                                      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Security Explanation

Docker isolation provides multiple layers of security:

1. **Process Isolation**: Commands run in a separate container namespace
2. **Filesystem Isolation**: Only the workspace directory is accessible
3. **Network Isolation**: Container has its own network stack
4. **Resource Limits**: CPU and memory usage can be capped
5. **User Permissions**: Container runs with limited privileges

### Bubblewrap Sandboxing

The Docker container can optionally use Bubblewrap for additional sandboxing:

- **Namespace isolation**: Separate PID, network, and mount namespaces
- **Capability dropping**: Removes unnecessary Linux capabilities
- **Seccomp filtering**: Restricts system calls
- **Read-only root**: Prevents modification of system files

To enable Bubblewrap, add to `Dockerfile`:

```dockerfile
RUN apt-get update && apt-get install -y bubblewrap
```

## Troubleshooting

### Common Errors

#### "Docker is not installed"

**Solution**: Install Docker Desktop or Docker Engine (see Prerequisites)

#### "Port 8080 is already in use"

**Solution**: Change the port during installation or stop the service using port 8080

#### "Cannot connect to Docker daemon"

**Solution**:
- Mac: Start Docker Desktop
- Linux: `sudo systemctl start docker`

#### "Permission denied" (Linux)

**Solution**: Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Connection Issues

#### Frontend cannot connect to terminal server

**The installation script now automatically handles most connection issues!**

If you still experience problems after running the install script:

1. **Check if container is running:**
   ```bash
   docker ps
   ```
   You should see `claude-code-container` in the list

2. **Check container logs:**
   ```bash
   docker logs claude-code-container
   ```

3. **Test connection manually:**
   ```bash
   curl http://localhost:8080/health
   ```
   Should return: `{"status": "healthy"}`

4. **Re-run the install script** - It will automatically detect and fix issues:
   ```bash
   ./install.sh
   ```

### Docker Problems

#### Container keeps restarting

Check logs for errors:
```bash
docker logs -f claude-code-container
```

Common causes:
- Missing dependencies in `requirements.txt`
- Invalid Python code in `server.py`
- Port already in use

#### Out of disk space

Clean up unused Docker resources:
```bash
docker system prune -a
```

#### Build fails

1. Clear Docker cache and rebuild:
   ```bash
   docker build --no-cache -t claude-code-server:latest .
   ```

2. Check Docker Desktop has enough resources allocated (Settings → Resources)

## Management Commands

### View Logs

**Real-time logs:**
```bash
docker logs -f claude-code-container
```

**Last 100 lines:**
```bash
docker logs --tail=100 claude-code-container
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

### Update Container

After modifying code or configuration:

```bash
docker stop claude-code-container
docker rm claude-code-container
docker build -t claude-code-server:latest .
# Then run install.sh again
```

### Remove Installation

**Stop and remove container:**
```bash
docker stop claude-code-container
docker rm claude-code-container
```

**Remove container and volume:**
```bash
docker stop claude-code-container
docker rm claude-code-container
docker volume rm claude-workspace
```

**Remove everything including image:**
```bash
docker stop claude-code-container
docker rm claude-code-container
docker volume rm claude-workspace
docker rmi claude-code-server:latest
```

### Access Container Shell

For debugging:
```bash
docker exec -it claude-code-container bash
```

## Security Comparison

### Docker Mode vs Local Mode

| Feature | Docker Mode | Local Mode |
|---------|-------------|------------|
| **Isolation** | ✅ Full container isolation | ❌ Direct host access |
| **File Access** | ✅ Limited to workspace | ❌ Full filesystem access |
| **Process Isolation** | ✅ Separate namespace | ❌ Same as host |
| **Resource Limits** | ✅ Configurable | ❌ Unlimited |
| **Network Isolation** | ✅ Container network | ❌ Host network |
| **Easy Cleanup** | ✅ Remove container | ❌ Manual cleanup |
| **Performance** | ⚠️ Slight overhead | ✅ Native speed |
| **Setup Complexity** | ⚠️ Requires Docker | ✅ Simple |

### What Docker Mode Protects Against

Docker isolation helps protect against:

1. **Accidental file deletion**: Limited to workspace directory
2. **System modification**: Cannot modify host system files
3. **Resource exhaustion**: CPU and memory limits prevent runaway processes
4. **Network attacks**: Isolated network stack
5. **Privilege escalation**: Container runs with limited privileges

### Limitations

Docker mode does NOT protect against:

1. **Malicious workspace modifications**: Files in workspace can still be modified
2. **Data exfiltration**: If network access is allowed, data can be sent out
3. **API key misuse**: If API keys are provided, they can be used
4. **Logical bugs**: Application logic errors are not prevented

**Best Practices:**
- Only mount necessary directories as workspace
- Use read-only volumes when possible
- Regularly review container logs
- Keep workspace backups
- Use separate API keys for testing

## Advanced Configuration

### Read-Only Workspace

To prevent Claude Code from modifying files:

```yaml
volumes:
  - ${WORKSPACE_PATH:-./workspace}:/workspace:ro
```

### Custom Network

Create an isolated network:

```yaml
networks:
  claude-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### Multiple Workspaces

Mount multiple directories:

```yaml
volumes:
  - ./workspace:/workspace
  - ./papers:/papers:ro
  - ./output:/output
```

## Support

For issues and questions:

- **GitHub Issues**: [AI4Research Issues](https://github.com/your-repo/AI4Research/issues)
- **Documentation**: See main [AI4Research README](../README.md)
- **Docker Docs**: [Docker Documentation](https://docs.docker.com/)

## License

Same as AI4Research project.
