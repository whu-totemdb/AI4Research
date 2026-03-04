#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration file
CONFIG_FILE=".env"
COMPOSE_TEMPLATE="docker-compose.template.yml"
COMPOSE_FILE="docker-compose.yml"

# Print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate port number
validate_port() {
    if [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; then
        return 0
    else
        return 1
    fi
}

# Validate memory format
validate_memory() {
    if [[ "$1" =~ ^[0-9]+[mMgG]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Validate CPU cores
validate_cpu() {
    if [[ "$1" =~ ^[0-9]+(\.[0-9]+)?$ ]] && (( $(echo "$1 > 0" | bc -l) )); then
        return 0
    else
        return 1
    fi
}

# Check Docker installation
check_docker() {
    print_info "Checking Docker installation..."
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi

    print_success "Docker is installed and running"
}

# Check Docker Compose installation
check_docker_compose() {
    print_info "Checking Docker Compose installation..."
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi

    print_success "Docker Compose is installed"
}

# Get user input with default value
get_input() {
    local prompt="$1"
    local default="$2"
    local value

    read -p "$(echo -e ${BLUE}${prompt}${NC} [${default}]: )" value
    echo "${value:-$default}"
}

# Get server IP address
get_server_ip() {
    if command_exists ip; then
        ip route get 1 | awk '{print $7; exit}'
    elif command_exists ifconfig; then
        ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1
    else
        echo "localhost"
    fi
}

# Main installation
main() {
    echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   Claude Code Docker Installation Script  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
    echo ""

    # Check prerequisites
    check_docker
    check_docker_compose

    echo ""
    print_info "Please provide configuration details:"
    echo ""

    # Get port
    while true; do
        PORT=$(get_input "Enter port number" "8080")
        if validate_port "$PORT"; then
            break
        else
            print_error "Invalid port number. Please enter a number between 1 and 65535."
        fi
    done

    # Get memory limit
    while true; do
        MEMORY=$(get_input "Enter memory limit (e.g., 2g, 512m)" "2g")
        if validate_memory "$MEMORY"; then
            break
        else
            print_error "Invalid memory format. Use format like '2g' or '512m'."
        fi
    done

    # Get CPU cores
    while true; do
        CPU=$(get_input "Enter CPU cores (e.g., 2, 1.5)" "2")
        if validate_cpu "$CPU"; then
            break
        else
            print_error "Invalid CPU value. Please enter a positive number."
        fi
    done

    # Get Claude API Key (optional)
    CLAUDE_API_KEY=$(get_input "Enter Claude API Key (optional, press Enter to skip)" "")

    echo ""
    print_info "Configuration summary:"
    echo "  Port: $PORT"
    echo "  Memory: $MEMORY"
    echo "  CPU: $CPU"
    echo "  API Key: ${CLAUDE_API_KEY:+***configured***}"
    echo ""

    read -p "$(echo -e ${YELLOW}Proceed with installation? [Y/n]:${NC} )" confirm
    if [[ ! "$confirm" =~ ^[Yy]?$ ]]; then
        print_warning "Installation cancelled."
        exit 0
    fi

    # Create .env file
    print_info "Creating configuration file..."
    cat > "$CONFIG_FILE" <<EOF
PORT=$PORT
MEMORY_LIMIT=$MEMORY
CPU_LIMIT=$CPU
CLAUDE_API_KEY=$CLAUDE_API_KEY
EOF
    print_success "Configuration saved to $CONFIG_FILE"

    # Generate docker-compose.yml
    print_info "Generating docker-compose.yml..."
    if [ -f "$COMPOSE_TEMPLATE" ]; then
        sed -e "s/\${PORT}/$PORT/g" \
            -e "s/\${MEMORY_LIMIT}/$MEMORY/g" \
            -e "s/\${CPU_LIMIT}/$CPU/g" \
            -e "s/\${CLAUDE_API_KEY}/$CLAUDE_API_KEY/g" \
            "$COMPOSE_TEMPLATE" > "$COMPOSE_FILE"
        print_success "docker-compose.yml generated"
    else
        # Create default docker-compose.yml if template doesn't exist
        cat > "$COMPOSE_FILE" <<EOF
version: '3.8'

services:
  claude-code:
    build: .
    container_name: claude-code-server
    ports:
      - "$PORT:8080"
    environment:
      - CLAUDE_API_KEY=$CLAUDE_API_KEY
    deploy:
      resources:
        limits:
          memory: $MEMORY
          cpus: '$CPU'
    restart: unless-stopped
    volumes:
      - ./workspace:/workspace
EOF
        print_success "docker-compose.yml created with default configuration"
    fi

    # Build Docker image
    print_info "Building Docker image (this may take a few minutes)..."
    if docker-compose build 2>&1 | tee /tmp/docker-build.log; then
        print_success "Docker image built successfully"
    else
        print_error "Failed to build Docker image. Check /tmp/docker-build.log for details."
        exit 1
    fi

    # Start container
    print_info "Starting container..."
    if docker-compose up -d; then
        print_success "Container started successfully"
    else
        print_error "Failed to start container"
        exit 1
    fi

    # Wait for service to be ready
    print_info "Waiting for service to be ready..."
    sleep 5

    # Test connection
    print_info "Testing connection..."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" | grep -q "200\|302\|404"; then
        print_success "Service is responding"
    else
        print_warning "Service may not be ready yet. Check logs with: docker-compose logs -f"
    fi

    # Display connection information
    SERVER_IP=$(get_server_ip)
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Installation Complete!             ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
    echo ""
    print_success "Claude Code is now running!"
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "  Local:   http://localhost:$PORT"
    echo "  Network: http://$SERVER_IP:$PORT"
    echo ""
    echo -e "${BLUE}Management Commands:${NC}"
    echo "  View logs:      docker-compose logs -f"
    echo "  Stop service:   docker-compose stop"
    echo "  Start service:  docker-compose start"
    echo "  Restart:        docker-compose restart"
    echo "  Remove:         docker-compose down"
    echo "  Remove all:     docker-compose down -v"
    echo ""
    print_info "Configuration saved in $CONFIG_FILE"
    echo ""
}

# Run main function
main
