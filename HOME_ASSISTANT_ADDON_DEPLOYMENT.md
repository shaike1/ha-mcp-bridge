# Home Assistant Add-on Deployment Guide for HA MCP Bridge

This document provides comprehensive planning and technical specifications for deploying the HA MCP Bridge as a Home Assistant Add-on.

## 📋 Project Overview

**Goal**: Convert the existing HA MCP Bridge into a Home Assistant Add-on that can be installed directly from the Home Assistant supervisor interface.

**Repository**: `https://github.com/shaike1/ha-mcp-bridge`  
**Current Status**: Standalone Docker container  
**Target**: Home Assistant Add-on with supervisor integration

## 🏗️ Architecture Requirements

### Current System
- **Container**: Node.js 18 Alpine with Express server
- **Port**: 3003 (configurable)
- **Protocol**: MCP over HTTP with OAuth 2.1
- **Features**: Home Assistant API integration, sensor monitoring, light control
- **Authentication**: OAuth 2.1 with PKCE, session persistence

### Target Add-on Architecture
- **Base Image**: Home Assistant Add-on base with Node.js
- **Integration**: Native HA supervisor API access
- **Configuration**: Home Assistant Add-on config schema
- **Networking**: Internal HA network + external access via Ingress
- **Security**: HA authentication integration

## 📁 Required Add-on File Structure

```
ha-mcp-addon/
├── config.yaml                 # Add-on manifest
├── Dockerfile                  # Add-on container definition
├── CHANGELOG.md                # Version history
├── DOCS.md                     # User documentation
├── README.md                   # Add-on overview
├── icon.png                    # Add-on icon (256x256)
├── logo.png                    # Add-on logo (128x128)
├── data/                       # Persistent data directory
├── rootfs/                     # Add-on filesystem
│   ├── etc/
│   │   └── s6-overlay/
│   │       └── s6-rc.d/
│   │           └── mcp-server/
│   │               ├── type
│   │               ├── run
│   │               └── finish
│   └── usr/
│       └── bin/
│           └── mcp-server.js   # Main server file
└── translations/               # Multi-language support
    ├── en.yaml
    └── he.yaml                 # Hebrew translations
```

## ⚙️ Configuration Schema (config.yaml)

```yaml
# Add-on manifest
name: "HA MCP Bridge"
version: "1.0.0"
slug: "ha-mcp-bridge"
description: "Model Context Protocol server for Home Assistant integration with Claude.ai"
url: "https://github.com/shaike1/ha-mcp-bridge"
arch:
  - aarch64
  - amd64
  - armhf
  - armv7
  - i386
init: false
startup: services
stage: stable

# Resource requirements
map:
  - addon_config:rw
  - share:rw
  - ssl:ro

# Port configuration
ports:
  3003/tcp: 3003

ports_description:
  3003/tcp: "MCP Server HTTP Port"

# Web UI configuration
webui: "http://[HOST]:[PORT:3003]"
ingress: true
ingress_port: 3003
ingress_stream: false
panel_icon: "mdi:home-assistant"
panel_title: "MCP Bridge"

# Add-on options schema
options:
  server_url: "https://your-domain.com"
  external_port: 3003
  log_level: "info"
  debug: false
  cors_origins: 
    - "https://claude.ai"
  oauth:
    enable: true
    admin_username: "admin"
    admin_password: "changeme"
  timeouts:
    request_timeout: 60000
    keepalive_timeout: 65000
    sse_ping_interval: 8000
  ha_integration:
    use_supervisor_token: true
    external_ha_url: ""
    external_ha_token: ""

schema:
  server_url: "str"
  external_port: "port"
  log_level: "list(debug|info|warning|error)"
  debug: "bool"
  cors_origins: ["str"]
  oauth:
    enable: "bool"
    admin_username: "str"
    admin_password: "str"
  timeouts:
    request_timeout: "int(5000,300000)"
    keepalive_timeout: "int(5000,300000)" 
    sse_ping_interval: "int(1000,30000)"
  ha_integration:
    use_supervisor_token: "bool"
    external_ha_url: "str?"
    external_ha_token: "str?"

# Image configuration
image: "ghcr.io/shaike1/ha-mcp-bridge/{arch}"

# Service discovery
discovery:
  - homeassistant

# Requirements
host_network: false
privileged: false
full_access: false

# Home Assistant API access
homeassistant_api: true
hassio_api: true
hassio_role: default

# Environment variables
environment:
  SUPERVISOR_TOKEN: "{{SUPERVISOR_TOKEN}}"
  HASSIO_TOKEN: "{{HASSIO_TOKEN}}"

# Backup inclusion
backup: include
```

## 🐳 Dockerfile for Add-on

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and npm
ARG BUILD_ARCH
RUN \
  apk add --no-cache \
    nodejs \
    npm \
    wget \
    curl

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY rootfs /

# Set permissions
RUN chmod a+x /usr/bin/mcp-server.js

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Labels
LABEL \
  io.hass.name="HA MCP Bridge" \
  io.hass.description="Model Context Protocol server for Home Assistant" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="addon" \
  io.hass.version="1.0.0"
```

## 🔧 Server Modifications for Add-on Integration

### Environment Variables Integration
```javascript
// Add-on configuration integration
const addonConfig = process.env.ADDON_CONFIG ? 
  JSON.parse(process.env.ADDON_CONFIG) : {};

const config = {
  port: addonConfig.external_port || process.env.PORT || 3003,
  serverUrl: addonConfig.server_url || process.env.SERVER_URL,
  logLevel: addonConfig.log_level || 'info',
  debug: addonConfig.debug || false,
  
  // Home Assistant integration
  haUrl: addonConfig.ha_integration?.use_supervisor_token ? 
    'http://supervisor/core' : 
    (addonConfig.ha_integration?.external_ha_url || process.env.HA_URL),
    
  haToken: addonConfig.ha_integration?.use_supervisor_token ?
    process.env.SUPERVISOR_TOKEN :
    (addonConfig.ha_integration?.external_ha_token || process.env.HA_TOKEN),
    
  // OAuth configuration
  oauth: {
    enabled: addonConfig.oauth?.enable ?? true,
    adminUsername: addonConfig.oauth?.admin_username || 'admin',
    adminPassword: addonConfig.oauth?.admin_password || 'changeme'
  },
  
  // Timeout settings
  timeouts: {
    request: addonConfig.timeouts?.request_timeout || 60000,
    keepalive: addonConfig.timeouts?.keepalive_timeout || 65000,
    ssePing: addonConfig.timeouts?.sse_ping_interval || 8000
  }
};
```

### Supervisor API Integration
```javascript
// Home Assistant Supervisor API client
class SupervisorAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'http://supervisor';
  }
  
  async getHAInfo() {
    const response = await fetch(`${this.baseUrl}/core/info`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }
  
  async getAddonInfo() {
    const response = await fetch(`${this.baseUrl}/addons/self/info`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }
}
```

## 📋 S6-Overlay Service Configuration

### `/rootfs/etc/s6-overlay/s6-rc.d/mcp-server/type`
```
longrun
```

### `/rootfs/etc/s6-overlay/s6-rc.d/mcp-server/run`
```bash
#!/usr/bin/with-contenv bashio

# Load configuration
CONFIG_PATH=/data/options.json
export ADDON_CONFIG="$(bashio::config)"

# Set log level
bashio::log.info "Starting HA MCP Bridge..."
bashio::log.info "Configuration: $(bashio::config)"

# Start the MCP server
exec node /usr/bin/mcp-server.js
```

### `/rootfs/etc/s6-overlay/s6-rc.d/mcp-server/finish`
```bash
#!/usr/bin/with-contenv bashio

bashio::log.info "HA MCP Bridge stopped"
```

## 📖 User Documentation (DOCS.md)

```markdown
# HA MCP Bridge Add-on

## About

The HA MCP Bridge add-on provides a Model Context Protocol (MCP) server that allows Claude.ai to interact directly with your Home Assistant installation.

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "HA MCP Bridge" add-on
3. Configure the add-on options
4. Start the add-on

## Configuration

### Basic Options
- **server_url**: External URL for the MCP server
- **external_port**: Port for external access (default: 3003)
- **log_level**: Logging verbosity (debug, info, warning, error)

### OAuth Settings
- **admin_username**: Admin username for OAuth flow
- **admin_password**: Admin password (change from default!)

### Home Assistant Integration
- **use_supervisor_token**: Use supervisor token for HA API access (recommended)
- **external_ha_url**: Custom HA URL (if not using supervisor)
- **external_ha_token**: Custom HA token (if not using supervisor)

## Usage

1. Configure Claude.ai to connect to: `https://your-domain.com:3003`
2. Follow the OAuth authentication flow
3. Claude.ai will have access to your HA devices and sensors

## Available Tools

- Device control (lights, switches, climate)
- Sensor monitoring (temperature, presence, water leak, motion)
- Automation management
- Entity discovery

## Security

- Change default admin password before use
- Use HTTPS for external access
- Monitor access logs regularly
- Rotate credentials periodically
```

## 🔄 Migration Steps from Current Setup

### 1. Repository Restructuring
```bash
# Create new add-on repository structure
mkdir ha-mcp-addon
cd ha-mcp-addon

# Copy and adapt existing files
cp ../ha-mcp/server.js rootfs/usr/bin/mcp-server.js
cp ../ha-mcp/package.json .
cp ../ha-mcp/README.md .

# Create add-on specific files
# (config.yaml, Dockerfile, DOCS.md, etc.)
```

### 2. Code Adaptations
- Modify server.js to read add-on configuration
- Add supervisor API integration
- Update authentication to work with HA users
- Adapt networking for add-on environment

### 3. Testing Strategy
- Test in Home Assistant development environment
- Verify supervisor API integration
- Test OAuth flow with add-on configuration
- Validate external access through Ingress

### 4. Publishing Workflow
- Create GitHub repository for add-on
- Set up GitHub Actions for multi-arch builds
- Configure container registry (GitHub Container Registry)
- Create add-on store repository

## 🚀 Deployment Steps for AI Agent

### Phase 1: Repository Setup
1. Create new repository: `ha-mcp-addon`
2. Set up directory structure as specified above
3. Copy and adapt existing codebase
4. Create all required configuration files

### Phase 2: Code Adaptation
1. Modify server.js for add-on integration
2. Implement supervisor API client
3. Add configuration schema validation
4. Update authentication system

### Phase 3: Container Setup
1. Create optimized Dockerfile
2. Set up S6-overlay services
3. Configure health checks
4. Test container locally

### Phase 4: Add-on Integration
1. Implement Home Assistant discovery
2. Add Ingress support
3. Configure backup inclusion
4. Test with supervisor

### Phase 5: Documentation
1. Create comprehensive DOCS.md
2. Add multi-language support
3. Create installation guide
4. Document troubleshooting steps

### Phase 6: Publishing
1. Set up GitHub Actions CI/CD
2. Configure multi-architecture builds
3. Publish to container registry
4. Create add-on store repository

## 📞 Support Information

**Original Project**: https://github.com/shaike1/ha-mcp-bridge  
**Documentation**: See CLAUDE_DESKTOP_SETUP.md for current setup  
**Features**: Timeout optimizations, sensor monitoring, light control  
**Status**: Production-ready standalone container

## 🔍 Technical Considerations

### Performance
- Memory usage optimization for add-on environment
- CPU resource management
- Network efficiency improvements

### Security
- Supervisor token handling
- Add-on permission model
- Network isolation considerations

### Maintenance
- Automatic update mechanisms
- Configuration migration strategies
- Backup and restore procedures

---

**Note**: This deployment plan transforms the existing standalone MCP server into a fully integrated Home Assistant add-on while maintaining all current functionality and optimizations.