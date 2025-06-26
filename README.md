# Home Assistant MCP Server

A Model Context Protocol (MCP) server for Home Assistant integration with Claude.ai, built with pure Node.js HTTP for maximum compatibility.

## 🎉 Features

- **Pure Node.js HTTP Architecture** - No Express dependencies, matches N8N MCP structure
- **Claude.ai Tool Discovery Fix** - Implements the `prompts/list` hack for proper tool discovery
- **OAuth 2.1 + PKCE Authentication** - Secure authentication flow
- **Real Home Assistant Integration** - Connect to actual HA instances with API tokens
- **5 Home Assistant Tools**:
  - `get_entities` - Get all HA entities or filter by domain
  - `call_service` - Call HA services to control devices
  - `get_automations` - Get all HA automations
  - `get_lights` - Get all light entities
  - `get_switches` - Get all switch entities

## 🚀 Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository>
   cd ha-mcp
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   # Edit docker-compose.yml with your settings
   ```

3. **Set Required Environment Variables**
   - `SERVER_URL` - Your public domain (e.g., https://ha-mcp.yourdomain.com)
   - `HA_URL` - Your Home Assistant URL (e.g., https://homeassistant.local:8123)
   - `HA_TOKEN` - Your Home Assistant Long-Lived Access Token
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` - Admin credentials for MCP server

4. **Run with Docker**
   ```bash
   docker-compose up -d
   ```

5. **Connect to Claude.ai**
   - Add MCP integration in Claude.ai
   - Use your SERVER_URL
   - Authenticate with admin credentials
   - Provide HA URL and token when prompted

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