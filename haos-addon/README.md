# Home Assistant MCP Server Add-on

This add-on provides a Model Context Protocol (MCP) server that enables Claude.ai to interact with your Home Assistant instance.

## Features

- **Direct HA Integration**: Automatically connects to your Home Assistant instance
- **10 Home Assistant Tools**: Complete control over lights, switches, climate, sensors, and more
- **OAuth 2.1 + PKCE**: Secure authentication with Claude.ai
- **Multi-tenant Support**: Optional support for multiple users
- **Ingress Support**: Access through Home Assistant UI

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "Home Assistant MCP Server" add-on
3. Configure the add-on options
4. Start the add-on
5. Connect to Claude.ai using the provided URL

## Configuration

### Required Options

- **server_url**: Your public URL (e.g., `https://your-domain.com/mcp`)
- **admin_password**: Secure password for MCP server authentication

### Optional Options

- **port**: Port for the MCP server (default: 3000)
- **admin_username**: Admin username (default: "admin")
- **log_level**: Logging level (debug, info, warn, error)
- **multi_tenant**: Enable multiple user support
- **enable_user_registration**: Allow new user registration

## Usage

1. Start the add-on
2. Open Claude.ai and add a new MCP integration
3. Use your `server_url` as the integration URL
4. Authenticate with your admin credentials
5. Start controlling your Home Assistant with Claude!

## Available Tools

- `get_entities` - Get all or filtered entities
- `call_service` - Call Home Assistant services
- `get_automations` - View automations
- `get_lights` - Get light entities
- `get_switches` - Get switch entities
- `get_climate` - Get climate entities
- `get_sensors` - Get sensor entities
- `control_lights` - Advanced light control
- `get_temperature_simple` - Get temperature data
- `test_simple` - Connection test

## Support

For issues and feature requests, please visit the GitHub repository.