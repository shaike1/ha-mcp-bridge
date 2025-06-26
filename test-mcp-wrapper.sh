#!/bin/bash

# Test script for MCP wrapper
# This script tests the MCP client wrapper with your HA MCP Bridge

echo "🧪 Testing MCP Client Wrapper"
echo "============================="

# Configuration
MCP_SERVER_URL="https://ha-mcp-web.right-api.com"
MCP_SERVER_TOKEN="${MCP_SERVER_TOKEN:-}"
HA_URL="${HA_URL:-}"
HA_TOKEN="${HA_TOKEN:-}"

# Check if required environment variables are set
if [ -z "$MCP_SERVER_TOKEN" ]; then
    echo "❌ MCP_SERVER_TOKEN environment variable is required"
    echo "   Set it with: export MCP_SERVER_TOKEN=your_api_key_here"
    exit 1
fi

if [ -z "$HA_URL" ]; then
    echo "❌ HA_URL environment variable is required"
    echo "   Set it with: export HA_URL=your_ha_url_here"
    exit 1
fi

if [ -z "$HA_TOKEN" ]; then
    echo "❌ HA_TOKEN environment variable is required"
    echo "   Set it with: export HA_TOKEN=your_ha_token_here"
    exit 1
fi

echo "✅ Configuration loaded:"
echo "   MCP Server: $MCP_SERVER_URL"
echo "   HA URL: $HA_URL"
echo "   Token: ${MCP_SERVER_TOKEN:0:10}..."

echo ""
echo "🔧 Testing MCP wrapper..."

# Test the wrapper with a simple initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | \
MCP_SERVER_URL="$MCP_SERVER_URL" \
MCP_SERVER_TOKEN="$MCP_SERVER_TOKEN" \
HA_URL="$HA_URL" \
HA_TOKEN="$HA_TOKEN" \
node mcp-client-wrapper.js

echo ""
echo "✅ Test completed!"
echo ""
echo "📝 Next steps:"
echo "1. If the test was successful, you should see a JSON response"
echo "2. Configure Claude AI Desktop with the claude-mcp-config.json file"
echo "3. Make sure to replace the placeholder values in the config file" 