#!/bin/bash
# Test script to verify Claude Code Docker connection

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load port from .env if exists
if [ -f .env ]; then
    source .env
else
    echo -e "${YELLOW}No .env file found. Using default port 8080${NC}"
    PORT=8080
fi

echo "Testing connection to http://localhost:$PORT"
echo ""

# Test 1: Container running
echo -n "1. Checking if container is running... "
if docker ps --format '{{.Names}}' | grep -q "^claude-code-container$"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo "Container is not running. Start it with: docker start claude-code-container"
    exit 1
fi

# Test 2: Port mapping
echo -n "2. Checking port mapping... "
PORT_MAP=$(docker port claude-code-container 8000 2>/dev/null || echo "")
if [ -n "$PORT_MAP" ]; then
    echo -e "${GREEN}✓${NC} ($PORT_MAP)"
else
    echo -e "${RED}✗${NC}"
    echo "Port 8000 is not mapped"
    exit 1
fi

# Test 3: Health endpoint
echo -n "3. Testing health endpoint... "
if curl -s -f http://localhost:$PORT/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    RESPONSE=$(curl -s http://localhost:$PORT/health)
    echo "   Response: $RESPONSE"
else
    echo -e "${RED}✗${NC}"
    echo "Health check failed. Check logs with: docker logs claude-code-container"
    exit 1
fi

# Test 4: Root endpoint
echo -n "4. Testing root endpoint... "
RESPONSE=$(curl -s http://localhost:$PORT/)
if [ -n "$RESPONSE" ]; then
    echo -e "${GREEN}✓${NC}"
    echo "   Response: $RESPONSE"
else
    echo -e "${RED}✗${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
echo ""
echo "Connection URL: http://localhost:$PORT"
