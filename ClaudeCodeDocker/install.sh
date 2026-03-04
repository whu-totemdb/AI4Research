#!/bin/bash
# Claude Code Docker Installation Script for Linux/Mac
# One-click installation with interactive configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Claude Code Docker Installation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check Docker installation
echo -e "${YELLOW}Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo -e "${YELLOW}Please install Docker first:${NC}"
    echo "  Linux: https://docs.docker.com/engine/install/"
    echo "  Mac: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    echo -e "${YELLOW}Please start Docker and try again${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed and running${NC}"
echo ""

# Interactive configuration
echo -e "${BLUE}Configuration:${NC}"
echo ""

# Port
read -p "Port [8080]: " PORT
PORT=${PORT:-8080}
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo -e "${RED}Invalid port number. Using default: 8080${NC}"
    PORT=8080
fi

# Memory limit
read -p "Memory limit [800m]: " MEMORY
MEMORY=${MEMORY:-800m}
if ! [[ "$MEMORY" =~ ^[0-9]+(m|M|g|G)$ ]]; then
    echo -e "${RED}Invalid memory format. Using default: NC}"
    MEMORY=800m
fi

# CPU cores
read -p "CPU cores [2]: " CPUS
CPUS=${CPUS:-2}
if ! [[ "$CPUS" =~ ^[0-9]+(\.[0-9]+)?$ ]] || (( $(echo "$CPUS <= 0" | bc -l) )); then
    echo -e "${RED}Invalid CPU cores. Using default: 2${NC}"
    CPUS=2
fi

# Claude API Key (optional)
read -p "Claude API Key (optional, press Enter to skip): " API_KEY

# Anthropic Base URL (optional)
read -p "Anthropic Base URL [https://api.anthropic.com]: " BASE_URL
BASE_URL=${BASE_URL:-https://api.anthropic.com}

echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  Port: $PORT"
echo "  Memory: $MEMORY"
echo "  CPU Cores: $CPUS"
echo "  API Key: ${API_KEY:+***configured***}"
echo "  Base URL: $BASE_URL"
echo ""

# Save configuration
cat > .env <<EOF
PORT=$PORT
MEMORY_LIMIT=$MEMORY
CPU_LIMIT=$CPUS
CLAUDE_API_KEY=$API_KEY
ANTHROPIC_BASE_URL=$BASE_URL
EOF

echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t claude-code-server:latest .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Stop and remove existing container if exists
if docker ps -a --format '{{.Names}}' | grep -q "^claude-code-container$"; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop claude-code-container &> /dev/null || true
    docker rm claude-code-container &> /dev/null || true
fi

# Start container
echo -e "${YELLOW}Starting Claude Code container...${NC}"

DOCKER_CMD="docker run -d \
  --name claude-code-container \
  -p 127.0.0.1:$PORT:8000 \
  -p [::1]:$PORT:8000 \
  --memory=$MEMORY \
  --cpus=$CPUS \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add SETUID \
  --cap-add SETGID \
  -v claude-workspace:/workspace"

if [ -n "$API_KEY" ]; then
    DOCKER_CMD="$DOCKER_CMD -e ANTHROPIC_AUTH_TOKEN=$API_KEY"
fi

if [ -n "$BASE_URL" ]; then
    DOCKER_CMD="$DOCKER_CMD -e ANTHROPIC_BASE_URL=$BASE_URL"
fi

DOCKER_CMD="$DOCKER_CMD claude-code-server:latest"

eval $DOCKER_CMD

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start container${NC}"
    exit 1
fi

# Wait for container to start
echo -e "${YELLOW}Waiting for service to start...${NC}"
sleep 3

# Test connection with retry logic
echo -e "${YELLOW}Testing connection...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0
CONNECTED=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$CONNECTED" = "false" ]; do
    if curl -s -f http://localhost:$PORT/health > /dev/null 2>&1; then
        CONNECTED=true
        echo -e "${GREEN}✓ Service is running${NC}"
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo -e "  Retry $RETRY_COUNT/$MAX_RETRIES..."
            sleep 2
        fi
    fi
done

if [ "$CONNECTED" = "false" ]; then
    echo -e "${YELLOW}⚠ Connection test failed, attempting automatic fix...${NC}"

    # Stop and restart with 0.0.0.0 binding
    docker stop claude-code-container &> /dev/null || true
    docker rm claude-code-container &> /dev/null || true

    # Rebuild command with 0.0.0.0 binding
    DOCKER_CMD="docker run -d \
      --name claude-code-container \
      -p 0.0.0.0:$PORT:8000 \
      --memory=$MEMORY \
      --cpus=$CPUS \
      --restart unless-stopped \
      --security-opt no-new-privileges:true \
      --cap-drop ALL \
      --cap-add CHOWN \
      --cap-add SETUID \
      --cap-add SETGID \
      -v claude-workspace:/workspace"

    if [ -n "$API_KEY" ]; then
        DOCKER_CMD="$DOCKER_CMD -e ANTHROPIC_AUTH_TOKEN=$API_KEY"
    fi

    if [ -n "$BASE_URL" ]; then
        DOCKER_CMD="$DOCKER_CMD -e ANTHROPIC_BASE_URL=$BASE_URL"
    fi

    DOCKER_CMD="$DOCKER_CMD claude-code-server:latest"
    eval $DOCKER_CMD

    sleep 3

    if curl -s -f http://localhost:$PORT/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Fix applied successfully!${NC}"
        CONNECTED=true
    else
        echo -e "${YELLOW}⚠ Still unable to connect${NC}"
        echo -e "${YELLOW}Container is running, but may need system restart${NC}"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}📍 Connection URLs:${NC}"
echo "  Local:   http://localhost:$PORT"

# Try to get network IP
if command -v hostname &> /dev/null; then
    NETWORK_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$NETWORK_IP" ]; then
        echo "  Network: http://$NETWORK_IP:$PORT"
    fi
fi

echo ""
echo -e "${BLUE}🔧 Management Commands:${NC}"
echo "  View logs:    docker logs -f claude-code-container"
echo "  Stop:         docker stop claude-code-container"
echo "  Start:        docker start claude-code-container"
echo "  Restart:      docker restart claude-code-container"
echo "  Remove:       docker stop claude-code-container && docker rm claude-code-container"
echo "  Remove all:   docker stop claude-code-container && docker rm claude-code-container && docker volume rm claude-workspace"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "  1. Copy the connection URL above"
echo "  2. Open AI4Research application"
echo "  3. Go to Settings → Claude Code Connection"
echo "  4. Paste the URL and test connection"
echo ""
