# HA MCP Bridge - Add-on Technical Specifications

This document provides detailed technical specifications for AI agents to implement the Home Assistant Add-on version of the HA MCP Bridge.

## 🎯 Implementation Objectives

### Primary Goal
Transform the existing standalone HA MCP Bridge into a native Home Assistant Add-on that integrates seamlessly with the Home Assistant Supervisor.

### Success Criteria
- ✅ One-click installation from HA Add-on store
- ✅ Native HA authentication integration
- ✅ Supervisor API access for enhanced security
- ✅ Web UI accessible through HA interface
- ✅ Configuration through HA Add-on config panel
- ✅ All existing MCP functionality preserved

## 🏗️ Technical Architecture

### Current State Analysis
```
Existing Setup:
├── Docker container (node:18-alpine)
├── Express.js server with OAuth 2.1
├── MCP protocol implementation
├── Home Assistant API client
├── Session persistence system
├── SSE streaming for tool discovery
└── Timeout optimizations for Claude.ai
```

### Target Add-on Architecture
```
HA Add-on Structure:
├── Supervisor integration layer
├── HA authentication bridge
├── Internal API access (supervisor token)
├── Ingress proxy support
├── Add-on configuration schema
├── S6-overlay service management
└── Multi-architecture container builds
```

## 📋 Required File Implementations

### 1. Add-on Manifest (config.yaml)
**Priority**: Critical  
**Complexity**: Medium

```yaml
# Essential configuration
name: "HA MCP Bridge"
version: "1.0.0"
slug: "ha-mcp-bridge"
description: "Model Context Protocol server for Claude.ai integration"
url: "https://github.com/shaike1/ha-mcp-bridge"

# Architecture support
arch:
  - aarch64
  - amd64
  - armhf
  - armv7
  - i386

# Service configuration
init: false
startup: services
stage: stable
hassio_api: true
homeassistant_api: true
hassio_role: default

# Network configuration
ports:
  3003/tcp: 3003
ingress: true
ingress_port: 3003
webui: "http://[HOST]:[PORT:3003]"

# Options schema (detailed in next section)
options: {...}
schema: {...}
```

**Implementation Notes**:
- Use existing port 3003 to maintain compatibility
- Enable both hassio_api and homeassistant_api for full integration
- Configure ingress for secure web access
- Support all major architectures

### 2. Container Definition (Dockerfile)
**Priority**: Critical  
**Complexity**: Medium

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# Essential packages
RUN apk add --no-cache nodejs npm wget curl

# Application setup
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

# File system setup
COPY rootfs /
RUN chmod a+x /usr/bin/mcp-server.js

# Health monitoring
HEALTHCHECK --interval=30s --timeout=10s \
  CMD wget --spider http://localhost:3003/health || exit 1
```

**Implementation Notes**:
- Base on HA add-on base images (`$BUILD_FROM`)
- Optimize for production (npm ci --only=production)
- Include health check endpoint
- Set proper file permissions

### 3. Service Runner (S6-Overlay)
**Priority**: Critical  
**Complexity**: Low

**File**: `/rootfs/etc/s6-overlay/s6-rc.d/mcp-server/run`
```bash
#!/usr/bin/with-contenv bashio

# Configuration loading
export ADDON_CONFIG="$(bashio::config)"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN}"

# Logging setup
bashio::log.info "Starting HA MCP Bridge v$(bashio::addon.version)"
bashio::log.info "Config: $(bashio::config.get 'log_level')"

# Server startup
exec node /usr/bin/mcp-server.js
```

**Implementation Notes**:
- Use bashio for configuration management
- Pass supervisor token to application
- Implement proper logging integration
- Handle graceful shutdowns

### 4. Server Code Adaptations
**Priority**: Critical  
**Complexity**: High

#### Configuration Integration
```javascript
// Add-on configuration loader
function loadAddonConfig() {
  const addonConfig = process.env.ADDON_CONFIG ? 
    JSON.parse(process.env.ADDON_CONFIG) : {};
  
  return {
    // Server settings
    port: addonConfig.external_port || 3003,
    serverUrl: addonConfig.server_url,
    logLevel: addonConfig.log_level || 'info',
    debug: addonConfig.debug || false,
    
    // HA integration
    haUrl: addonConfig.ha_integration?.use_supervisor_token ? 
      'http://supervisor/core' : 
      addonConfig.ha_integration?.external_ha_url,
      
    haToken: addonConfig.ha_integration?.use_supervisor_token ?
      process.env.SUPERVISOR_TOKEN :
      addonConfig.ha_integration?.external_ha_token,
      
    // OAuth settings
    oauth: {
      enabled: addonConfig.oauth?.enable ?? true,
      adminUsername: addonConfig.oauth?.admin_username,
      adminPassword: addonConfig.oauth?.admin_password
    },
    
    // Timeout optimizations (preserve existing)
    timeouts: {
      request: addonConfig.timeouts?.request_timeout || 60000,
      keepalive: addonConfig.timeouts?.keepalive_timeout || 65000,
      ssePing: addonConfig.timeouts?.sse_ping_interval || 8000
    }
  };
}
```

#### Supervisor API Integration
```javascript
// Home Assistant Supervisor API client
class SupervisorAPI {
  constructor() {
    this.token = process.env.SUPERVISOR_TOKEN;
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
  
  async updateAddonConfig(config) {
    const response = await fetch(`${this.baseUrl}/addons/self/options`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });
    return response.json();
  }
}
```

#### Authentication Bridge
```javascript
// HA user authentication integration
async function authenticateWithHA(username, password) {
  try {
    // Use supervisor API to validate against HA users
    const response = await fetch('http://supervisor/auth', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const userData = await response.json();
      return userData;
    }
    return null;
  } catch (error) {
    console.error('HA authentication failed:', error);
    return null;
  }
}
```

### 5. Configuration Schema
**Priority**: High  
**Complexity**: Medium

```yaml
# Complete options schema
options:
  # Server configuration
  server_url: "https://your-domain.com"
  external_port: 3003
  log_level: "info"
  debug: false
  
  # CORS and security
  cors_origins:
    - "https://claude.ai"
    - "https://app.claude.ai"
  
  # OAuth configuration
  oauth:
    enable: true
    admin_username: "admin"
    admin_password: "changeme123!"
    session_timeout: 86400
  
  # Home Assistant integration
  ha_integration:
    use_supervisor_token: true
    external_ha_url: ""
    external_ha_token: ""
    api_timeout: 30000
  
  # Performance tuning
  timeouts:
    request_timeout: 60000
    keepalive_timeout: 65000
    sse_ping_interval: 8000
    ha_api_timeout: 30000
  
  # Feature toggles
  features:
    enable_sensors: true
    enable_lights: true
    enable_climate: true
    enable_automations: true

# Validation schema
schema:
  server_url: "url"
  external_port: "port"
  log_level: "list(debug|info|warning|error)"
  debug: "bool"
  cors_origins: ["url"]
  oauth:
    enable: "bool"
    admin_username: "str"
    admin_password: "str"
    session_timeout: "int(300,604800)"
  ha_integration:
    use_supervisor_token: "bool"
    external_ha_url: "url?"
    external_ha_token: "str?"
    api_timeout: "int(5000,120000)"
  timeouts:
    request_timeout: "int(5000,300000)"
    keepalive_timeout: "int(5000,300000)"
    sse_ping_interval: "int(1000,30000)"
    ha_api_timeout: "int(5000,120000)"
  features:
    enable_sensors: "bool"
    enable_lights: "bool"
    enable_climate: "bool"
    enable_automations: "bool"
```

## 🔄 Migration Strategy

### Phase 1: Core Adaptation
1. **Extract server.js logic** into modular components
2. **Implement configuration loader** for add-on environment
3. **Add supervisor API client** for HA integration
4. **Update authentication system** to support HA users

### Phase 2: Container Setup
1. **Create optimized Dockerfile** with add-on base
2. **Implement S6-overlay services** for process management
3. **Configure health checks** and monitoring
4. **Set up proper file permissions** and security

### Phase 3: Integration Testing
1. **Test supervisor token access** to HA API
2. **Verify ingress proxy functionality** for web UI
3. **Validate configuration schema** with various inputs
4. **Test multi-architecture builds** for compatibility

### Phase 4: Documentation
1. **Create comprehensive DOCS.md** for users
2. **Add configuration examples** and troubleshooting
3. **Document security considerations** and best practices
4. **Create installation and update guides**

## 🔧 Code Preservation Requirements

### Critical Features to Maintain
- **All existing MCP tools** (sensors, lights, climate, etc.)
- **OAuth 2.1 authentication** with PKCE support
- **SSE streaming** for tool discovery
- **Session persistence** across connections
- **Timeout optimizations** for Claude.ai compatibility
- **Error handling** and logging systems

### Performance Optimizations to Preserve
- **8-second SSE ping intervals** for connection stability
- **30-second HA API timeouts** for reliability
- **60-second request timeouts** for server stability
- **Response size optimizations** for Claude.ai compatibility

### Security Features to Maintain
- **OAuth code challenge** validation
- **Session token management** with expiration
- **CORS configuration** for Claude.ai domains
- **API rate limiting** and request validation

## 📊 Testing Requirements

### Unit Tests
- Configuration loading and validation
- Supervisor API client functionality
- Authentication system integration
- MCP protocol compliance

### Integration Tests
- Add-on installation and startup
- HA API access through supervisor
- Web UI accessibility through ingress
- Claude.ai connectivity and tool discovery

### Performance Tests
- Memory usage under load
- Response time optimization
- Connection stability testing
- Multi-user session handling

## 🚀 Deployment Pipeline

### Build Process
1. **Multi-architecture container builds** (aarch64, amd64, armhf, armv7, i386)
2. **Automated testing** on each architecture
3. **Security scanning** of container images
4. **Version tagging** and release management

### Distribution
1. **GitHub Container Registry** for image hosting
2. **Add-on repository** setup for HA integration
3. **Documentation website** for user guides
4. **Update notification** system for users

## 💾 Data Management

### Persistent Data
- **Session storage** in `/data/sessions.json`
- **User configuration** in `/data/config.json`
- **Access logs** in `/data/logs/`
- **OAuth tokens** in encrypted format

### Backup Strategy
- **Automatic backup** inclusion in HA snapshots
- **Configuration export/import** functionality
- **Session data recovery** mechanisms
- **Log rotation** and archival

## 🔍 Monitoring and Observability

### Health Checks
- **HTTP endpoint** monitoring (`/health`)
- **HA API connectivity** validation
- **OAuth service** availability checks
- **Resource usage** monitoring

### Logging Integration
- **Structured logging** with JSON format
- **Log level configuration** through add-on options
- **Error aggregation** and alerting
- **Performance metrics** collection

---

**Implementation Priority**: High  
**Estimated Effort**: 2-3 weeks for experienced developer  
**Dependencies**: Home Assistant Supervisor API knowledge  
**Testing Environment**: Home Assistant development installation required