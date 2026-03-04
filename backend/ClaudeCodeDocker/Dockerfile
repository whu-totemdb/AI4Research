# Base image: Ubuntu 22.04
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    bubblewrap \
    python3 \
    python3-pip \
    nodejs \
    npm \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user
RUN groupadd -g 1000 claude && \
    useradd -u 1000 -g claude -m -s /bin/bash claude

# Create workspace directory with proper permissions
RUN mkdir -p /workspace && \
    chown -R claude:claude /workspace

# Copy terminal-server code
COPY --chown=claude:claude terminal-server /app/terminal-server

# Set working directory
WORKDIR /app/terminal-server

# Install terminal-server dependencies
RUN npm install

# Switch to non-root user
USER claude

# Expose port
EXPOSE 8080

# Start terminal server
CMD ["node", "server.js"]
