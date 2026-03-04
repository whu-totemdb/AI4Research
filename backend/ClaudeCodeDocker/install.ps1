# Claude Code Docker Installation Script for Windows
# Requires PowerShell 5.1 or higher

# Configuration
$ConfigFile = ".env"
$ComposeTemplate = "docker-compose.template.yml"
$ComposeFile = "docker-compose.yml"

# Color functions
function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

# Check if command exists
function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Validate port number
function Test-Port {
    param([string]$Port)
    if ($Port -match '^\d+$' -and [int]$Port -ge 1 -and [int]$Port -le 65535) {
        return $true
    }
    return $false
}

# Validate memory format
function Test-Memory {
    param([string]$Memory)
    return $Memory -match '^\d+[mMgG]$'
}

# Validate CPU cores
function Test-CPU {
    param([string]$CPU)
    if ($CPU -match '^\d+(\.\d+)?$') {
        $value = [double]$CPU
        return $value -gt 0
    }
    return $false
}

# Check Docker installation
function Test-Docker {
    Write-Info "Checking Docker installation..."

    if (-not (Test-CommandExists "docker")) {
        Write-Error-Custom "Docker is not installed. Please install Docker Desktop first."
        Write-Host "Visit: https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    }

    try {
        $null = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error-Custom "Docker daemon is not running. Please start Docker Desktop."
            exit 1
        }
    }
    catch {
        Write-Error-Custom "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    }

    Write-Success "Docker is installed and running"
}

# Check Docker Compose installation
function Test-DockerCompose {
    Write-Info "Checking Docker Compose installation..."

    $composeV1 = Test-CommandExists "docker-compose"
    $composeV2 = $false

    try {
        $null = docker compose version 2>&1
        $composeV2 = $LASTEXITCODE -eq 0
    }
    catch {
        $composeV2 = $false
    }

    if (-not $composeV1 -and -not $composeV2) {
        Write-Error-Custom "Docker Compose is not installed. Please install Docker Desktop with Compose."
        Write-Host "Visit: https://docs.docker.com/compose/install/"
        exit 1
    }

    Write-Success "Docker Compose is installed"
}

# Get user input with default value
function Get-UserInput {
    param(
        [string]$Prompt,
        [string]$Default
    )

    $input = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($input)) {
        return $Default
    }
    return $input
}

# Get server IP address
function Get-ServerIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 |
               Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1" } |
               Select-Object -First 1).IPAddress

        if ($null -eq $ip) {
            return "localhost"
        }
        return $ip
    }
    catch {
        return "localhost"
    }
}

# Main installation function
function Start-Installation {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   Claude Code Docker Installation Script  ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""

    # Check prerequisites
    Test-Docker
    Test-DockerCompose

    Write-Host ""
    Write-Info "Please provide configuration details:"
    Write-Host ""

    # Get port
    do {
        $Port = Get-UserInput -Prompt "Enter port number" -Default "8080"
        if (Test-Port -Port $Port) {
            break
        }
        Write-Error-Custom "Invalid port number. Please enter a number between 1 and 65535."
    } while ($true)

    # Get memory limit
    do {
        $Memory = Get-UserInput -Prompt "Enter memory limit (e.g., 2g, 512m)" -Default "2g"
        if (Test-Memory -Memory $Memory) {
            break
        }
        Write-Error-Custom "Invalid memory format. Use format like '2g' or '512m'."
    } while ($true)

    # Get CPU cores
    do {
        $CPU = Get-UserInput -Prompt "Enter CPU cores (e.g., 2, 1.5)" -Default "2"
        if (Test-CPU -CPU $CPU) {
            break
        }
        Write-Error-Custom "Invalid CPU value. Please enter a positive number."
    } while ($true)

    # Get Claude API Key (optional)
    $ClaudeAPIKey = Get-UserInput -Prompt "Enter Claude API Key (optional, press Enter to skip)" -Default ""

    Write-Host ""
    Write-Info "Configuration summary:"
    Write-Host "  Port: $Port"
    Write-Host "  Memory: $Memory"
    Write-Host "  CPU: $CPU"
    if (-not [string]::IsNullOrWhiteSpace($ClaudeAPIKey)) {
        Write-Host "  API Key: ***configured***"
    }
    Write-Host ""

    $confirm = Read-Host "Proceed with installation? [Y/n]"
    if ($confirm -match '^[Nn]') {
        Write-Warning-Custom "Installation cancelled."
        exit 0
    }

    # Create .env file
    Write-Info "Creating configuration file..."
    $envContent = @"
PORT=$Port
MEMORY_LIMIT=$Memory
CPU_LIMIT=$CPU
CLAUDE_API_KEY=$ClaudeAPIKey
"@
    $envContent | Out-File -FilePath $ConfigFile -Encoding UTF8
    Write-Success "Configuration saved to $ConfigFile"

    # Generate docker-compose.yml
    Write-Info "Generating docker-compose.yml..."
    if (Test-Path $ComposeTemplate) {
        $template = Get-Content $ComposeTemplate -Raw
        $template = $template -replace '\$\{PORT\}', $Port
        $template = $template -replace '\$\{MEMORY_LIMIT\}', $Memory
        $template = $template -replace '\$\{CPU_LIMIT\}', $CPU
        $template = $template -replace '\$\{CLAUDE_API_KEY\}', $ClaudeAPIKey
        $template | Out-File -FilePath $ComposeFile -Encoding UTF8
        Write-Success "docker-compose.yml generated"
    }
    else {
        # Create default docker-compose.yml if template doesn't exist
        $composeContent = @"
version: '3.8'

services:
  claude-code:
    build: .
    container_name: claude-code-server
    ports:
      - "$Port:8080"
    environment:
      - CLAUDE_API_KEY=$ClaudeAPIKey
    deploy:
      resources:
        limits:
          memory: $Memory
          cpus: '$CPU'
    restart: unless-stopped
    volumes:
      - ./workspace:/workspace
"@
        $composeContent | Out-File -FilePath $ComposeFile -Encoding UTF8
        Write-Success "docker-compose.yml created with default configuration"
    }

    # Build Docker image
    Write-Info "Building Docker image (this may take a few minutes)..."
    try {
        docker-compose build 2>&1 | Tee-Object -FilePath "$env:TEMP\docker-build.log"
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Docker image built successfully"
        }
        else {
            Write-Error-Custom "Failed to build Docker image. Check $env:TEMP\docker-build.log for details."
            exit 1
        }
    }
    catch {
        Write-Error-Custom "Failed to build Docker image: $_"
        exit 1
    }

    # Start container
    Write-Info "Starting container..."
    try {
        docker-compose up -d
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Container started successfully"
        }
        else {
            Write-Error-Custom "Failed to start container"
            exit 1
        }
    }
    catch {
        Write-Error-Custom "Failed to start container: $_"
        exit 1
    }

    # Wait for service to be ready
    Write-Info "Waiting for service to be ready..."
    Start-Sleep -Seconds 5

    # Test connection
    Write-Info "Testing connection..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        Write-Success "Service is responding"
    }
    catch {
        Write-Warning-Custom "Service may not be ready yet. Check logs with: docker-compose logs -f"
    }

    # Display connection information
    $ServerIP = Get-ServerIP
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║         Installation Complete!             ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Success "Claude Code is now running!"
    Write-Host ""
    Write-Host "Access URLs:" -ForegroundColor Cyan
    Write-Host "  Local:   http://localhost:$Port"
    Write-Host "  Network: http://$ServerIP:$Port"
    Write-Host ""
    Write-Host "Management Commands:" -ForegroundColor Cyan
    Write-Host "  View logs:      docker-compose logs -f"
    Write-Host "  Stop service:   docker-compose stop"
    Write-Host "  Start service:  docker-compose start"
    Write-Host "  Restart:        docker-compose restart"
    Write-Host "  Remove:         docker-compose down"
    Write-Host "  Remove all:     docker-compose down -v"
    Write-Host ""
    Write-Info "Configuration saved in $ConfigFile"
    Write-Host ""
}

# Run installation
Start-Installation
