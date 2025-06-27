# Claude Desktop MCP Configuration

This document explains how to configure Claude Desktop to connect to your Home Assistant MCP server.

## 📋 Overview

The HA MCP Bridge can be used with Claude Desktop in two ways:
1. **Local mode**: Run the server locally with Claude Desktop
2. **Remote mode**: Connect to the deployed server via HTTP

## 🖥️ Option 1: Local Claude Desktop Setup

### 1. Configuration File Location

Claude Desktop looks for MCP configuration at:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 2. Local Configuration

```json
{
  "mcpServers": {
    "ha-mcp-bridge": {
      "command": "node",
      "args": [
        "/absolute/path/to/ha-mcp/server.js"
      ],
      "env": {
        "PORT": "3003",
        "NODE_ENV": "production",
        "HA_URL": "https://ha.right-api.com",
        "HA_TOKEN": "your_ha_token_here"
      }
    }
  }
}
```

### 3. Setup Steps

1. **Clone the repository** to your local machine:
   ```bash
   git clone https://github.com/shaike1/ha-mcp-bridge.git
   cd ha-mcp-bridge
   npm install
   ```

2. **Update the configuration** with your actual paths:
   - Replace `/absolute/path/to/ha-mcp/server.js` with your actual path
   - Replace `your_ha_token_here` with your Home Assistant token

3. **Restart Claude Desktop** to load the new configuration

## 🌐 Option 2: Remote HTTP MCP Setup (Experimental)

### Using MCP over HTTP

```json
{
  "mcpServers": {
    "ha-mcp-remote": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-everything",
        "--url",
        "https://test.right-api.com"
      ]
    }
  }
}
```

**Note**: This requires MCP HTTP transport support in Claude Desktop (experimental feature).

## 🔧 Available Tools

Once connected, Claude Desktop will have access to these tools:

### 🏠 Home Assistant Tools
- `get_entities` - Get all HA entities or filter by domain
- `call_service` - Control devices via HA services
- `get_automations` - List all automations
- `get_lights` - Get all light entities
- `get_switches` - Get all switch entities
- `get_climate` - Get climate/HVAC information

### 🔍 Sensor Tools
- `get_sensors` - Get sensor data (water leak, presence, motion, temperature)
- `control_lights` - Control lights with brightness and color

### 🧪 Test Tools
- `test_simple` - Simple connectivity test
- `get_temperature_simple` - Mock temperature data (fast)

## 🔍 Verification

### Check if MCP is loaded
1. Open Claude Desktop
2. Look for MCP tools in the interface
3. Try a simple command: "Test the MCP connection"

### Troubleshooting

#### Tools not appearing
- Check the file path in the configuration
- Verify Node.js is installed and accessible
- Check Claude Desktop logs for errors

#### Connection issues
- Verify Home Assistant URL and token
- Check network connectivity
- Review server logs

#### Permission errors
- Ensure the server.js file is executable
- Check file permissions on the configuration directory

## 📊 Logging and Debugging

Enable debug logging by setting:
```json
"env": {
  "DEBUG": "true",
  "LOG_LEVEL": "debug"
}
```

## 🔐 Security Notes

- Store sensitive tokens securely
- Use environment variables for production
- Regularly rotate API tokens
- Monitor access logs

## 📁 File Structure

```
ha-mcp/
├── server.js                    # Main MCP server
├── claude-desktop-mcp.json     # Desktop config template
├── CLAUDE_DESKTOP_SETUP.md     # This documentation
├── package.json                 # Dependencies
└── README.md                    # Project overview
```

## 🔄 Updates

To update the MCP server:
1. Pull latest changes: `git pull`
2. Install dependencies: `npm install`
3. Restart Claude Desktop

## 📞 Support

For issues and questions:
- Check the main README.md
- Review the troubleshooting guide
- Check server logs for error details

---

**Note**: This configuration allows Claude Desktop to directly control your Home Assistant devices. Use with appropriate caution and security measures.