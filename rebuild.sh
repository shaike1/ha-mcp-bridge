#!/bin/bash

echo "🔧 Building HA MCP Proxy container (without affecting existing containers)..."

# Build new proxy image
echo "1. Building proxy image..."
docker-compose build ha-mcp-proxy

# Start only the proxy container
echo "2. Starting proxy container..."
docker-compose up -d ha-mcp-proxy

# Show status
echo "3. Container status:"
docker-compose ps

echo "4. Proxy container logs:"
docker-compose logs ha-mcp-proxy

echo "✅ Proxy container ready!"
echo ""
echo "🌐 Main HA MCP Server: https://ha-mcp.right-api.com"
echo "🔗 Claude Proxy: https://ha-mcp.right-api.com/claude"
echo "🔑 Proxy API Key: proxy-claude-key"
echo ""
echo "📝 To test the proxy:"
echo "   node test-proxy.js" 