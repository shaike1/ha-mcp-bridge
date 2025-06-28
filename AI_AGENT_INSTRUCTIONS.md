# AI Agent Implementation Instructions for HA MCP Bridge Add-on

This document provides step-by-step instructions for an AI agent to convert the existing HA MCP Bridge into a Home Assistant Add-on.

## 🤖 AI Agent Task Overview

**Mission**: Transform the standalone HA MCP Bridge into a native Home Assistant Add-on while preserving all existing functionality and optimizations.

**Source Code**: Available at `/root/ha-mcp/` - fully functional MCP server with Claude.ai optimizations
**Target**: Home Assistant Add-on compatible with Supervisor API
**Complexity**: Medium-High (requires HA Add-on architecture knowledge)

## 📋 Prerequisites Checklist

Before starting implementation, ensure you have:
- [ ] Access to Home Assistant development environment
- [ ] Understanding of Home Assistant Add-on architecture
- [ ] Knowledge of S6-overlay process management
- [ ] Docker multi-architecture build capabilities
- [ ] GitHub repository and container registry access

## 🎯 Step-by-Step Implementation Guide

### Step 1: Repository Preparation
**Estimated Time**: 30 minutes

1. **Create new repository** for the add-on:
   ```bash
   # Create add-on repository structure
   mkdir ha-mcp-addon
   cd ha-mcp-addon
   
   # Initialize repository
   git init
   git remote add origin https://github.com/[username]/ha-mcp-addon.git
   ```

2. **Set up directory structure**:
   ```bash
   # Create required directories
   mkdir -p rootfs/usr/bin
   mkdir -p rootfs/etc/s6-overlay/s6-rc.d/mcp-server
   mkdir -p translations
   mkdir -p data
   ```

3. **Copy essential files** from source:
   ```bash
   # Copy main application files
   cp /root/ha-mcp/server.js rootfs/usr/bin/mcp-server.js
   cp /root/ha-mcp/package.json .
   cp /root/ha-mcp/package-lock.json .
   
   # Copy documentation
   cp /root/ha-mcp/README.md .
   ```

### Step 2: Configuration Files Creation
**Estimated Time**: 45 minutes

1. **Create config.yaml** (Add-on manifest):
   ```yaml
   # Copy the complete config.yaml from ADDON_TECHNICAL_SPECS.md
   # Pay special attention to:
   # - Architecture support (aarch64, amd64, armhf, armv7, i386)
   # - Port configuration (3003/tcp)
   # - Supervisor API access (hassio_api: true, homeassistant_api: true)
   # - Ingress configuration for web UI
   ```

2. **Create Dockerfile**:
   ```dockerfile
   # Use the Dockerfile template from ADDON_TECHNICAL_SPECS.md
   # Key requirements:
   # - ARG BUILD_FROM for HA base images
   # - Node.js installation
   # - Production dependencies only
   # - Health check implementation
   # - Proper file permissions
   ```

3. **Create DOCS.md** (User documentation):
   ```markdown
   # Copy user documentation template
   # Include:
   # - Installation instructions
   # - Configuration options explanation
   # - Usage examples
   # - Troubleshooting guide
   ```

### Step 3: S6-Overlay Service Setup
**Estimated Time**: 20 minutes

1. **Create service type file**:
   ```bash
   echo "longrun" > rootfs/etc/s6-overlay/s6-rc.d/mcp-server/type
   ```

2. **Create service run script**:
   ```bash
   # File: rootfs/etc/s6-overlay/s6-rc.d/mcp-server/run
   # Copy the run script from ADDON_TECHNICAL_SPECS.md
   # Ensure executable permissions: chmod +x
   ```

3. **Create service finish script**:
   ```bash
   # File: rootfs/etc/s6-overlay/s6-rc.d/mcp-server/finish
   # Copy the finish script for proper shutdown handling
   ```

### Step 4: Server Code Adaptation
**Estimated Time**: 2-3 hours

1. **Implement configuration loader**:
   ```javascript
   // Add to beginning of server.js
   function loadAddonConfig() {
     // Implement the loadAddonConfig function from ADDON_TECHNICAL_SPECS.md
     // This replaces hardcoded environment variables
   }
   
   const config = loadAddonConfig();
   ```

2. **Add Supervisor API client**:
   ```javascript
   // Add SupervisorAPI class from ADDON_TECHNICAL_SPECS.md
   // This enables integration with HA Supervisor
   class SupervisorAPI {
     // Implement all methods for HA integration
   }
   ```

3. **Modify HA API integration**:
   ```javascript
   // Update haRequest function to use supervisor token when available
   // Preserve existing functionality for external HA instances
   async function haRequest(endpoint, options = {}, sessionToken = null) {
     // Use config.haUrl and config.haToken from loadAddonConfig()
     // Maintain all existing timeout optimizations
   }
   ```

4. **Update authentication system**:
   ```javascript
   // Add HA user authentication option
   async function authenticateWithHA(username, password) {
     // Implement the authentication bridge from ADDON_TECHNICAL_SPECS.md
     // Fall back to existing OAuth system if needed
   }
   ```

### Step 5: Preserve Critical Features
**Estimated Time**: 1 hour

**CRITICAL**: Ensure these existing optimizations are preserved:

1. **Timeout settings** (from existing server.js):
   ```javascript
   // Keep these exact values:
   httpServer.timeout = 60000; // 60 seconds request timeout
   httpServer.keepAliveTimeout = 65000; // 65 seconds keep-alive
   httpServer.headersTimeout = 66000; // 66 seconds headers timeout
   ```

2. **SSE ping intervals**:
   ```javascript
   // Keep 8-second ping intervals for Claude.ai stability
   const keepAlive = setInterval(() => {
     res.write('data: {"type":"ping"}\n\n');
   }, 8000);
   ```

3. **HA API timeouts**:
   ```javascript
   // Keep 30-second timeouts for HA API calls
   const timeoutId = setTimeout(() => controller.abort(), 30000);
   timeout: 30000,
   ```

4. **All existing MCP tools**:
   - `get_entities`, `call_service`, `get_automations`
   - `get_lights`, `get_switches`, `get_climate`
   - `get_sensors`, `control_lights`
   - `test_simple`, `get_temperature_simple`

### Step 6: Testing Setup
**Estimated Time**: 1 hour

1. **Create test configuration**:
   ```yaml
   # Create test-config.yaml with sample configuration
   server_url: "http://localhost:3003"
   external_port: 3003
   log_level: "debug"
   debug: true
   oauth:
     enable: true
     admin_username: "admin"
     admin_password: "test123"
   ha_integration:
     use_supervisor_token: true
   ```

2. **Local testing script**:
   ```bash
   # Create test-addon.sh
   #!/bin/bash
   docker build -t ha-mcp-addon-test .
   docker run -p 3003:3003 \
     -e ADDON_CONFIG='{"external_port":3003,"log_level":"debug"}' \
     -e SUPERVISOR_TOKEN="test-token" \
     ha-mcp-addon-test
   ```

### Step 7: Build System Setup
**Estimated Time**: 45 minutes

1. **GitHub Actions workflow**:
   ```yaml
   # .github/workflows/build.yml
   name: Build Add-on
   on: [push, pull_request]
   jobs:
     build:
       runs-on: ubuntu-latest
       strategy:
         matrix:
           arch: [aarch64, amd64, armhf, armv7, i386]
       steps:
         - uses: actions/checkout@v3
         - name: Build add-on
           uses: home-assistant/builder@master
           with:
             args: |
               --target /data
               --generic ${{ matrix.arch }}
   ```

2. **Version management**:
   ```json
   // package.json - update version to match config.yaml
   {
     "name": "ha-mcp-addon",
     "version": "1.0.0",
     "description": "Home Assistant Add-on for HA MCP Bridge"
   }
   ```

### Step 8: Documentation and Assets
**Estimated Time**: 30 minutes

1. **Create add-on assets**:
   - `icon.png` (256x256) - HA MCP Bridge icon
   - `logo.png` (128x128) - Project logo

2. **Update documentation**:
   ```markdown
   # Update README.md for add-on specific information
   # Include installation instructions for HA Add-on store
   # Add configuration examples
   # Document differences from standalone version
   ```

3. **Create CHANGELOG.md**:
   ```markdown
   # Changelog
   
   ## [1.0.0] - Initial Add-on Release
   - Converted standalone container to HA Add-on
   - Added Supervisor API integration
   - Preserved all MCP functionality and optimizations
   - Added Ingress support for web UI
   ```

## 🔍 Validation Checklist

After implementation, verify these requirements:

### Functionality Tests
- [ ] Add-on installs successfully in HA
- [ ] Configuration UI loads and saves properly
- [ ] Web UI accessible through HA interface
- [ ] MCP server responds to health checks
- [ ] All existing tools function correctly
- [ ] OAuth authentication works
- [ ] Session persistence maintained
- [ ] Timeout optimizations preserved

### Integration Tests
- [ ] Supervisor token access to HA API
- [ ] Ingress proxy functionality
- [ ] Multi-architecture builds successful
- [ ] Resource usage within reasonable limits
- [ ] Backup/restore functionality
- [ ] Log output readable in HA interface

### Security Tests
- [ ] No sensitive data in logs
- [ ] Proper token handling
- [ ] CORS configuration correct
- [ ] Authentication required for access
- [ ] API endpoints properly secured

## 🚨 Critical Implementation Notes

### Do NOT Change These Elements
1. **MCP protocol implementation** - Keep exact JSON-RPC 2.0 format
2. **Tool definitions** - Preserve all existing tool schemas
3. **Timeout values** - Keep optimized values for Claude.ai
4. **SSE streaming logic** - Maintain tool discovery mechanism
5. **Session management** - Preserve authentication state handling

### Must Preserve
1. **All 14 existing MCP tools** with exact functionality
2. **OAuth 2.1 with PKCE** authentication flow
3. **8-second SSE ping intervals** for connection stability
4. **30-second HA API timeouts** for reliability
5. **Response size optimizations** for Claude.ai compatibility

### Add-on Specific Requirements
1. **Configuration schema validation** must be strict
2. **Supervisor token usage** should be default/recommended
3. **Ingress support** must be properly configured
4. **Multi-architecture builds** are required
5. **HA backup inclusion** must work correctly

## 📞 Support and Resources

### Reference Documentation
- **Original Code**: `/root/ha-mcp/server.js` (fully optimized)
- **Architecture Guide**: `HOME_ASSISTANT_ADDON_DEPLOYMENT.md`
- **Technical Specs**: `ADDON_TECHNICAL_SPECS.md`
- **Current Features**: `README.md`, `PROJECT_JOURNEY_HE.md`

### Home Assistant Resources
- [Add-on Development Guide](https://developers.home-assistant.io/docs/add-ons/)
- [S6-Overlay Documentation](https://github.com/just-containers/s6-overlay)
- [Supervisor API Reference](https://developers.home-assistant.io/docs/api/supervisor/)

### Testing Environment
- **Existing Server**: `https://test.right-api.com` (for reference)
- **Container**: Running on port 3003 with all optimizations
- **Test Clients**: Available in repository for validation

---

**Success Criteria**: The add-on should provide identical functionality to the current standalone server while integrating seamlessly with Home Assistant's add-on ecosystem.

**Timeline**: 1-2 days for experienced developer, 3-5 days for learning curve
**Priority**: Maintain all existing optimizations and functionality first, then add HA integration features.