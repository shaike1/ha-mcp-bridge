#!/bin/sh

# Exit on any error
set -e

echo "=== HA MCP Bridge with Cloudflared Support ==="

# Install system dependencies
echo "Installing system dependencies..."
apk add --no-cache wget curl supervisor

# Install cloudflared
echo "Installing cloudflared..."
ARCH=$(uname -m)
case $ARCH in
    x86_64) CLOUDFLARED_ARCH="amd64" ;;
    aarch64) CLOUDFLARED_ARCH="arm64" ;;
    armv7l) CLOUDFLARED_ARCH="arm" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}" -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

echo "Cloudflared version: $(/usr/local/bin/cloudflared --version)"

# Setup application
echo "Setting up HA MCP Bridge..."
npm install --only=production
mkdir -p data public scripts logs

# Create supervisor configuration
cat > /etc/supervisord.conf << 'EOF'
[unix_http_server]
file=/tmp/supervisor.sock

[supervisord]
logfile=/app/logs/supervisord.log
logfile_maxbytes=50MB
logfile_backups=10
loglevel=info
pidfile=/tmp/supervisord.pid
nodaemon=true
silent=false
user=root

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///tmp/supervisor.sock

[program:ha-mcp-bridge]
command=node server.js
directory=/app
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/app/logs/ha-mcp-bridge.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
environment=PORT="3003",NODE_ENV="production"

[program:cloudflared]
command=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token %(ENV_CLOUDFLARED_TOKEN)s
directory=/app
autostart=false
autorestart=true
redirect_stderr=true
stdout_logfile=/app/logs/cloudflared.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
EOF

# Enable cloudflared if token is provided
if [ ! -z "$CLOUDFLARED_TOKEN" ]; then
    echo "Cloudflared token provided - enabling tunnel"
    sed -i 's/autostart=false/autostart=true/' /etc/supervisord.conf
    echo "Cloudflared will start automatically"
else
    echo "No Cloudflared token provided - tunnel disabled"
    echo "Set CLOUDFLARED_TOKEN environment variable to enable tunnel"
fi

echo "Starting services with supervisor..."
exec /usr/bin/supervisord -c /etc/supervisord.conf