# Home Assistant MCP Server

A Model Context Protocol (MCP) server for Home Assistant integration with Claude.ai, built with pure Node.js HTTP for maximum compatibility.

## 🎉 Features

- **Pure Node.js HTTP Architecture** - No Express dependencies, matches N8N MCP structure
- **Claude.ai Tool Discovery Fix** - Implements the `prompts/list` hack for proper tool discovery
- **OAuth 2.1 + PKCE Authentication** - Secure authentication flow
- **Real Home Assistant Integration** - Connect to actual HA instances with API tokens
- **10 Home Assistant Tools**:
  - `get_entities` - Get all HA entities or filter by domain
  - `call_service` - Call HA services to control devices
  - `get_automations` - Get all HA automations
  - `get_lights` - Get all light entities
  - `get_switches` - Get all switch entities
  - `get_climate` - Get climate/HVAC entities
  - `get_sensors` - Get sensor entities
  - `control_lights` - Control lights with actions, brightness, and color
  - `get_temperature_simple` - Mock temperature data for testing
  - `test_simple` - Simple test tool for connection verification
- **Token Management** - Register and manage API tokens via a dedicated endpoint.

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Using pre-built images from GitHub Container Registry
docker run -d \
  --name ha-mcp-server \
  -p 3000:3000 \
  -e SERVER_URL=https://your-domain.com \
  -e HA_URL=https://your-ha-instance.com \
  -e HA_TOKEN=your_ha_token \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your_secure_password \
  shaikeme/ha-mcp-server:latest
```

### Option 2: Docker Compose

```bash
# Clone repository
git clone https://github.com/shaike1/ha-mcp-bridge.git
cd ha-mcp-bridge

# Use pre-built image
docker-compose -f docker-compose.registry.yml up -d

# Or build locally
docker-compose up -d
```

### Option 3: Home Assistant Add-on (HAOS)

1. Add this repository to your Home Assistant add-on store
2. Install "Home Assistant MCP Server" add-on
3. Configure with your public URL and admin password
4. Start the add-on
5. Connect to Claude.ai using the add-on URL

### Option 4: Manual Installation

```bash
git clone https://github.com/shaike1/ha-mcp-bridge.git
cd ha-mcp-bridge
npm install
npm start
```

### Connect to Claude.ai

1. Add MCP integration in Claude.ai
2. Use your SERVER_URL
3. Authenticate with admin credentials
4. Start controlling Home Assistant with Claude!

## 🔧 Configuration

### Home Assistant Setup

1. Create a Long-Lived Access Token in Home Assistant:
   - Go to Profile → Security → Long-Lived Access Tokens
   - Create new token
   - Copy the token value

2. Ensure your HA instance is accessible from your MCP server

### MCP Server Setup

The server requires these environment variables:

```env
PORT=3001
SERVER_URL=https://your-domain.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
HA_URL=https://your-ha-instance.com
HA_TOKEN=your_ha_token_here
```

### API Token Management

You can register a new API token using the `/tokens/register` endpoint:

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"description":"my-new-key","scope":"mcp"}' \
http://localhost:3007/tokens/register
```

## 🏗️ Architecture

This MCP server uses **pure Node.js HTTP** (no Express) to match the architecture of working MCP servers and ensure maximum compatibility with Claude.ai.

### Key Components

- **OAuth 2.1 + PKCE Flow** - Secure authentication
- **Claude.ai Compatibility Hacks** - Implements workarounds for Claude.ai's non-standard MCP behavior
- **Server-Sent Events (SSE)** - Real-time tool broadcasting
- **Home Assistant API Integration** - Direct REST API calls to HA

### Claude.ai Compatibility

This server implements several workarounds for Claude.ai's non-standard MCP behavior:

1. **`prompts/list` Hack** - Claude.ai only calls `prompts/list`, never `tools/list`
2. **SSE Tool Broadcasting** - Auto-sends tools via Server-Sent Events
3. **Transport Declaration** - Uses `streamable-http` transport type

## 🔒 Security

- OAuth 2.1 with PKCE for secure authentication
- Session-based authentication management
- No hardcoded credentials in code
- Secure token storage and validation

## 🐛 Troubleshooting

### "No tools provided" in Claude.ai
- Ensure OAuth authentication completes successfully
- Check that HA_URL and HA_TOKEN are correct
- Verify Home Assistant is accessible from the MCP server

### Connection issues
- Check SERVER_URL matches your actual domain
- Verify SSL certificates are valid
- Ensure port 3001 is accessible

### Home Assistant API errors
- Verify HA_TOKEN has proper permissions
- Check Home Assistant logs for API errors
- Ensure HA_URL format is correct (include protocol and port)

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🔗 Related Projects

- [N8N MCP Server](https://github.com/your-org/n8n-mcp) - Similar architecture
- [Model Context Protocol](https://github.com/anthropics/model-context-protocol) - Official MCP documentation

---

**Made with ❤️ for the Home Assistant and Claude.ai communities**
