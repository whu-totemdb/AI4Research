#!/bin/bash
# Entrypoint script to configure Claude and start the server

set -e

# Create Claude config directory
mkdir -p /root/.claude

# Create .claude.json with onboarding completed
cat > /root/.claude.json <<EOF
{
  "hasCompletedOnboarding": true
}
EOF

# Create settings.json with environment variables
SETTINGS_FILE="/root/.claude/settings.json"
cat > "$SETTINGS_FILE" <<EOF
{
  "alwaysThinkingEnabled": true,
  "env": {
EOF

# Add ANTHROPIC_AUTH_TOKEN if set
if [ -n "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo "    \"ANTHROPIC_AUTH_TOKEN\": \"$ANTHROPIC_AUTH_TOKEN\"" >> "$SETTINGS_FILE"

    # Add comma if BASE_URL is also set
    if [ -n "$ANTHROPIC_BASE_URL" ]; then
        echo "," >> "$SETTINGS_FILE"
    fi
fi

# Add ANTHROPIC_BASE_URL if set
if [ -n "$ANTHROPIC_BASE_URL" ]; then
    # If no AUTH_TOKEN, add it without leading comma
    if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
        echo "    \"ANTHROPIC_BASE_URL\": \"$ANTHROPIC_BASE_URL\"" >> "$SETTINGS_FILE"
    else
        echo "    \"ANTHROPIC_BASE_URL\": \"$ANTHROPIC_BASE_URL\"" >> "$SETTINGS_FILE"
    fi
fi

# Close the JSON
cat >> "$SETTINGS_FILE" <<EOF
  }
}
EOF

echo "Claude configuration created:"
echo "  - /root/.claude.json"
echo "  - /root/.claude/settings.json"

# Start the server
exec python server.py
