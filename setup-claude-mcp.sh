#!/bin/bash

# Setup script for Claude AI Desktop MCP configuration
# This script helps you configure the MCP connection to your HA MCP Bridge

echo "🔧 Claude AI Desktop MCP Configuration Setup"
echo "============================================="

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/claude-mcp-config.json"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    exit 1
fi

echo ""
echo "📋 Current Configuration:"
echo "------------------------"
cat "$CONFIG_FILE" | jq '.' 2>/dev/null || cat "$CONFIG_FILE"

echo ""
echo "🔑 Configuration Steps:"
echo "======================"

echo ""
echo "1. Get your API key from the HA MCP Bridge dashboard:"
echo "   - Visit: https://ha-mcp-web.right-api.com"
echo "   - Login with your API key"
echo "   - Copy your API key"

echo ""
echo "2. Get your Home Assistant details:"
echo "   - Home Assistant URL (e.g., https://ha.right-api.com)"
echo "   - Long-lived access token from Home Assistant"

echo ""
echo "3. Update the configuration file:"
echo "   - Edit: $CONFIG_FILE"
echo "   - Replace the placeholder values:"
echo "     * YOUR_API_KEY_HERE → Your MCP Bridge API key"
echo "     * YOUR_HA_URL_HERE → Your Home Assistant URL"
echo "     * YOUR_HA_TOKEN_HERE → Your Home Assistant token"

echo ""
echo "4. Test the connection:"
echo "   - Run: node mcp-client-wrapper.js"
echo "   - Or use the test script: ./test-mcp.sh"

echo ""
echo "5. Configure Claude AI Desktop:"
echo "   - Open Claude AI Desktop"
echo "   - Go to Settings → MCP Servers"
echo "   - Add the configuration from: $CONFIG_FILE"
echo "   - Or copy the configuration to Claude's MCP config directory"

echo ""
echo "📁 Alternative Configuration Locations:"
echo "======================================"

# Detect OS and show appropriate config locations
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "macOS Claude AI Desktop config locations:"
    echo "  ~/Library/Application Support/Claude/claude_desktop_config.json"
    echo "  ~/Library/Application Support/Claude/mcp_servers.json"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "Linux Claude AI Desktop config locations:"
    echo "  ~/.config/Claude/claude_desktop_config.json"
    echo "  ~/.config/Claude/mcp_servers.json"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows
    echo "Windows Claude AI Desktop config locations:"
    echo "  %APPDATA%\\Claude\\claude_desktop_config.json"
    echo "  %APPDATA%\\Claude\\mcp_servers.json"
fi

echo ""
echo "🔧 Quick Setup Commands:"
echo "======================="

echo ""
echo "# Test the MCP wrapper:"
echo "MCP_SERVER_URL=https://ha-mcp-web.right-api.com \\"
echo "MCP_SERVER_TOKEN=your_api_key_here \\"
echo "HA_URL=your_ha_url_here \\"
echo "HA_TOKEN=your_ha_token_here \\"
echo "node mcp-client-wrapper.js"

echo ""
echo "# Generate a complete config (replace with your values):"
echo "cat > claude-mcp-config.json << 'EOF'"
echo "{"
echo "  \"mcpServers\": {"
echo "    \"ha-mcp-bridge\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$(pwd)/mcp-client-wrapper.js\"],"
echo "      \"env\": {"
echo "        \"MCP_SERVER_URL\": \"https://ha-mcp-web.right-api.com\","
echo "        \"MCP_SERVER_TOKEN\": \"your_api_key_here\","
echo "        \"HA_URL\": \"your_ha_url_here\","
echo "        \"HA_TOKEN\": \"your_ha_token_here\""
echo "      }"
echo "    }"
echo "  }"
echo "}"
echo "EOF"

echo ""
echo "✅ Setup complete! Follow the steps above to configure your connection." 