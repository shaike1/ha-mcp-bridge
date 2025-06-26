# Claude AI Desktop MCP Bridge Setup

This guide provides multiple fallback options for connecting Claude AI Desktop to your HA MCP Bridge server.

## 🎯 Problem

Claude AI Desktop expects MCP servers to communicate via stdio (standard input/output), but your HA MCP Bridge uses HTTP-based communication. This creates a protocol mismatch that prevents direct connection.

## 🔧 Solution: MCP HTTP Wrapper

The primary solution is `mcp-client-wrapper.js` - a Node.js wrapper that:
1. Accepts stdio-based MCP requests from Claude AI Desktop
2. Converts them to HTTP requests to your HA MCP Bridge
3. Returns the responses back to Claude AI Desktop

## 📁 Files Created

- `mcp-client-wrapper.js` - Main HTTP-to-stdio wrapper
- `claude-mcp-config.json` - Claude AI Desktop configuration
- `setup-claude-mcp.sh` - Setup helper script
- `test-mcp-wrapper.sh` - Test script
- `mcp-remote-config.json` - Alternative configurations

## 🚀 Quick Setup

### 1. Get Your Credentials

```bash
# Get your API key from the dashboard
# Visit: https://ha-mcp-web.right-api.com
# Login and copy your API key

# Get your Home Assistant details
# - HA URL (e.g., https://ha.right-api.com)
# - Long-lived access token
```

### 2. Test the Connection

```bash
# Set environment variables
export MCP_SERVER_TOKEN="your_api_key_here"
export HA_URL="your_ha_url_here"
export HA_TOKEN="your_ha_token_here"

# Test the wrapper
./test-mcp-wrapper.sh
```

### 3. Configure Claude AI Desktop

Edit `claude-mcp-config.json`:
```json
{
  "mcpServers": {
    "ha-mcp-bridge": {
      "command": "node",
      "args": ["/path/to/mcp-client-wrapper.js"],
      "env": {
        "MCP_SERVER_URL": "https://ha-mcp-web.right-api.com",
        "MCP_SERVER_TOKEN": "your_api_key_here",
        "HA_URL": "your_ha_url_here",
        "HA_TOKEN": "your_ha_token_here"
      }
    }
  }
}
```

### 4. Add to Claude AI Desktop

**Option A: Via Settings UI**
1. Open Claude AI Desktop
2. Go to Settings → MCP Servers
3. Add the configuration from `claude-mcp-config.json`

**Option B: Direct Config File**
Copy the configuration to Claude's config directory:

**macOS:**
```bash
cp claude-mcp-config.json ~/Library/Application\ Support/Claude/
```

**Linux:**
```bash
cp claude-mcp-config.json ~/.config/Claude/
```

**Windows:**
```bash
copy claude-mcp-config.json %APPDATA%\Claude\
```

## 🔄 Alternative Fallback Options

### Option 1: Direct HTTP Client (Advanced)

Use `mcp-remote-config.json` with direct HTTP commands:

```json
{
  "mcpServers": {
    "ha-mcp-bridge-direct": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-H", "Authorization: Bearer YOUR_API_KEY_HERE",
        "-H", "ha-url: YOUR_HA_URL_HERE",
        "-H", "ha-token: YOUR_HA_TOKEN_HERE",
        "-d", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}",
        "https://ha-mcp-web.right-api.com/"
      ]
    }
  }
}
```

### Option 2: OAuth Flow (If Available)

If you have OAuth credentials:

```json
{
  "mcpServers": {
    "ha-mcp-bridge-oauth": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-cli", "stdio"],
      "env": {
        "MCP_SERVER_URL": "https://ha-mcp-web.right-api.com",
        "MCP_OAUTH_CLIENT_ID": "YOUR_CLIENT_ID",
        "MCP_OAUTH_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
        "MCP_OAUTH_REDIRECT_URI": "https://ha-mcp-web.right-api.com/oauth/callback"
      }
    }
  }
}
```

### Option 3: WebSocket Bridge (Future)

If your server supports WebSocket connections:

```json
{
  "mcpServers": {
    "ha-mcp-bridge-ws": {
      "command": "wscat",
      "args": [
        "-c", "wss://ha-mcp-web.right-api.com/ws",
        "-H", "Authorization: Bearer YOUR_API_KEY_HERE",
        "-H", "ha-url: YOUR_HA_URL_HERE",
        "-H", "ha-token: YOUR_HA_TOKEN_HERE"
      ]
    }
  }
}
```

## 🧪 Testing

### Test the Wrapper
```bash
# Set environment variables
export MCP_SERVER_TOKEN="your_api_key"
export HA_URL="your_ha_url"
export HA_TOKEN="your_ha_token"

# Test with initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node mcp-client-wrapper.js
```

### Test Tools List
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node mcp-client-wrapper.js
```

### Test Tool Call
```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_entities","arguments":{}}}' | node mcp-client-wrapper.js
```

## 🔍 Troubleshooting

### Common Issues

1. **"MCP_SERVER_TOKEN environment variable is required"**
   - Set your API key: `export MCP_SERVER_TOKEN=your_key`

2. **"Cannot connect to Home Assistant"**
   - Check your HA URL and token
   - Ensure HA is accessible from the server

3. **"Server not initialized"**
   - The wrapper requires an initialize call first
   - This should happen automatically in Claude AI Desktop

4. **Claude doesn't show tools**
   - Restart Claude AI Desktop after adding the configuration
   - Check the logs for any error messages
   - Verify the wrapper is working with the test script

### Debug Mode

Enable debug logging:
```bash
export DEBUG=true
node mcp-client-wrapper.js
```

### Check Server Status

```bash
# Test server directly
curl -X POST https://ha-mcp-web.right-api.com/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "ha-url: YOUR_HA_URL" \
  -H "ha-token: YOUR_HA_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

## 📋 Available Tools

Once connected, Claude will have access to these Home Assistant tools:

- `get_entities` - Get all entities or filter by domain
- `call_service` - Call HA services to control devices
- `get_automations` - Get all automations
- `get_lights` - Get all light entities
- `get_switches` - Get all switch entities

## 🎉 Success Indicators

- Claude AI Desktop shows "MCP Servers" in settings
- No error messages in Claude's logs
- Tools appear in Claude's interface
- You can ask Claude to control your Home Assistant devices

## 📞 Support

If you're still having issues:

1. Check the server logs: `tail -f server.log`
2. Test the wrapper manually with the test script
3. Verify your credentials are correct
4. Ensure your HA instance is accessible
5. Try restarting both the server and Claude AI Desktop 