#!/bin/bash

echo "🚀 Starting MCP Proxy locally..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Set environment variables
export PORT=3002
export HA_MCP_URL=http://localhost:3001
export API_KEY=proxy-claude-key
export JWT_SECRET=proxy-jwt-secret

echo "🔧 Environment:"
echo "   PORT: $PORT"
echo "   HA_MCP_URL: $HA_MCP_URL"
echo "   API_KEY: $API_KEY"

# Start the proxy
echo "🚀 Starting proxy server..."
node mcp-proxy.js 