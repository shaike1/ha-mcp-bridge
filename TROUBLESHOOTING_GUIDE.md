# Home Assistant MCP + Claude.ai Integration: Complete Troubleshooting Guide

## 🎯 Executive Summary

This document details the complete solution for integrating Home Assistant MCP (Model Context Protocol) servers with Claude.ai web interface. The primary issue was **tool discovery failure** - Claude.ai would connect successfully but show "No tools provided" despite the server having 5 functioning Home Assistant tools.

## 🚨 The Core Problem

### Initial Issue
- **Symptom**: Claude.ai showed "Connected" status but displayed "No tools provided"
- **Impact**: Users couldn't access any Home Assistant functionality through Claude.ai
- **Root Cause**: Claude.ai's HTTP MCP client doesn't follow standard MCP protocol

### Technical Details
Claude.ai's web interface has **non-standard MCP behavior**:
1. **Never calls `tools/list`** - Standard MCP protocol expects clients to call this endpoint
2. **Only calls `prompts/list`** - A different endpoint entirely  
3. **Requires specific SSE format** - Server-Sent Events must follow exact patterns
4. **Transport compatibility** - Must use `streamable-http` not `sse`

## 🔍 Issues Encountered and Solutions

### Issue 1: Express.js Architecture Mismatch
**Problem**: Original server used Express.js framework
**Symptom**: Tools not appearing despite successful connection
**Solution**: Complete rewrite using pure Node.js HTTP
```javascript
// ❌ Before: Express-based
const app = express();
app.post('/', handleMCP);

// ✅ After: Pure Node.js HTTP  
const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    await handleMCPRequest(req, res);
  }
});
```

### Issue 2: Tool Discovery Protocol Violation
**Problem**: Claude.ai never calls `tools/list` endpoint
**Symptom**: Server logs show no `tools/list` requests
**Solution**: Implement "prompts/list hack"
```javascript
// 🎯 THE BREAKTHROUGH: prompts/list hack
case 'prompts/list':
  // HACK: Since Claude.ai only requests prompts/list and never tools/list,
  // we'll send the tools response when it asks for prompts
  console.log('HACK: Claude.ai requested prompts/list, sending tools instead!');
  result = {
    tools: haTools  // Send tools instead of prompts!
  };
  break;
```

### Issue 3: Server Transport Declaration
**Problem**: Wrong transport type in server discovery
**Symptom**: Claude.ai connection issues
**Solution**: Use `streamable-http` instead of `sse`
```javascript
// ❌ Before
transport: 'sse'

// ✅ After  
transport: 'streamable-http'
```

### Issue 4: SSE Tool Broadcasting Format
**Problem**: Tools sent via SSE weren't recognized
**Symptom**: Connection successful but no tools appear
**Solution**: Exact N8N-compatible SSE format
```javascript
// 🎯 Critical SSE Format
const toolsNotification = {
  jsonrpc: '2.0',
  method: 'notifications/tools/list_changed',
  params: {
    tools: haTools
  }
};
res.write(`data: ${JSON.stringify(toolsNotification)}\n\n`);
```

### Issue 5: OAuth 2.1 Configuration
**Problem**: Authentication flow not completing properly
**Symptom**: "Unauthorized" errors
**Solution**: Proper OAuth 2.1 + PKCE implementation
```javascript
// ✅ Correct OAuth Discovery
{
  "issuer": "https://your-domain.com",
  "authorization_endpoint": "https://your-domain.com/oauth/authorize", 
  "token_endpoint": "https://your-domain.com/oauth/token",
  "code_challenge_methods_supported": ["S256"]
}
```

## 🚀 The Breakthrough Moment

The **critical breakthrough** came from analyzing the working N8N MCP server and discovering:

1. **Architecture Pattern**: Working MCP servers use pure Node.js HTTP, not Express
2. **The prompts/list Hack**: Claude.ai calls wrong endpoint - must intercept and send tools
3. **SSE Broadcasting**: Tools must be auto-pushed via Server-Sent Events in specific format
4. **Transport Declaration**: Must declare `streamable-http` for Claude.ai compatibility

## ✅ Essential Steps for Working OAuth 2.1 MCP with Claude.ai

### Step 1: Pure Node.js HTTP Architecture
```javascript
import http from 'http';

const httpServer = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Handle OAuth endpoints
  if (parsedUrl.pathname === '/oauth/authorize') {
    await handleOAuthAuthorize(req, res);
  }
  // Handle MCP endpoints  
  else if (parsedUrl.pathname === '/' && req.method === 'POST') {
    await handleMCPRequest(req, res);
  }
});
```

### Step 2: Correct Server Discovery Response
```javascript
// ✅ Required format for Claude.ai compatibility
{
  "name": "Your MCP Server",
  "version": "1.0.0", 
  "description": "Description with Streamable HTTP",
  "transport": "streamable-http",  // ← Critical!
  "protocol": "2024-11-05",
  "capabilities": {
    "tools": {
      "listChanged": true  // ← Enables tool change notifications
    },
    "prompts": {}
  }
}
```

### Step 3: OAuth 2.1 + PKCE Endpoints
```javascript
// OAuth discovery endpoint
'/.well-known/oauth-authorization-server': {
  "issuer": SERVER_URL,
  "authorization_endpoint": `${SERVER_URL}/oauth/authorize`,
  "token_endpoint": `${SERVER_URL}/oauth/token`, 
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"]  // ← PKCE required
}
```

### Step 4: The Critical prompts/list Hack
```javascript
// ✅ Essential for Claude.ai tool discovery
switch (message.method) {
  case 'prompts/list':
    // HACK: Claude.ai only calls this, never tools/list
    console.log('HACK: Sending tools for prompts/list request');
    result = {
      tools: yourTools  // Send tools array here!
    };
    break;
    
  case 'tools/list':
    // Standard MCP - other clients will call this
    result = {
      tools: yourTools
    };
    break;
}
```

### Step 5: Server-Sent Events (SSE) Implementation
```javascript
// ✅ SSE connection handling
if (req.method === 'GET' && acceptHeader.includes('text/event-stream')) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Auto-send tools via SSE
  const toolsNotification = {
    jsonrpc: '2.0',
    method: 'notifications/tools/list_changed',
    params: { tools: yourTools }
  };
  
  res.write(`data: ${JSON.stringify(toolsNotification)}\n\n`);
}
```

### Step 6: Authentication Flow
```javascript
// ✅ Complete OAuth flow
1. GET /.well-known/oauth-authorization-server  // Discovery
2. POST /oauth/register                         // Client registration  
3. GET /oauth/authorize                         // Authorization
4. POST /oauth/login                           // User login
5. GET /oauth/approve                          // User approval
6. POST /oauth/token                           // Token exchange
7. Authenticated MCP requests with Bearer token
```

## 🎯 Critical Success Factors

### Must-Have Requirements:
1. **Pure Node.js HTTP** - No Express framework
2. **prompts/list hack** - Intercept and send tools
3. **streamable-http transport** - Correct transport declaration  
4. **SSE tool broadcasting** - Auto-push tools via Server-Sent Events
5. **OAuth 2.1 + PKCE** - Proper authentication flow
6. **Consistent domain URLs** - All OAuth URLs must match server domain

### Architecture Comparison:
```
❌ Broken (Express-based):
Express App → Router → Middleware → Handler

✅ Working (Pure Node.js):  
HTTP Server → URL Parser → Direct Handler → Response
```

## 🔧 Debugging Steps

### 1. Verify Server Discovery
```bash
curl https://your-domain.com/
# Should return transport: "streamable-http"
```

### 2. Check OAuth Discovery  
```bash
curl https://your-domain.com/.well-known/oauth-authorization-server
# Should return proper OAuth endpoints
```

### 3. Monitor MCP Requests
```bash
docker logs your-container --tail 50 | grep "MCP Request"
# Should see: prompts/list, notifications/initialized
```

### 4. Verify SSE Connection
```bash
curl -N -H "Accept: text/event-stream" https://your-domain.com/
# Should establish SSE connection and send tools
```

## 📋 Troubleshooting Checklist

- [ ] Server uses pure Node.js HTTP (not Express)
- [ ] Server discovery returns `transport: "streamable-http"`
- [ ] OAuth discovery endpoints are accessible
- [ ] prompts/list handler sends tools instead of prompts
- [ ] SSE connection auto-broadcasts tools
- [ ] All OAuth URLs use consistent domain
- [ ] Authentication completes successfully
- [ ] Home Assistant API token is valid

## 🎉 Success Indicators

When everything works correctly:
1. **Claude.ai shows "Connected"** status
2. **All tools appear in Claude.ai interface** 
3. **Tools can be called successfully**
4. **Real Home Assistant data is returned**

## 📚 Key Learnings

1. **Claude.ai is not MCP-compliant** - Requires specific workarounds
2. **Architecture matters** - Pure Node.js HTTP works, Express doesn't  
3. **Multiple discovery methods needed** - Both prompts/list hack AND SSE broadcasting
4. **Transport declaration is critical** - Must be `streamable-http`
5. **OAuth consistency required** - All URLs must match server domain

This solution represents months of debugging and analysis, culminating in a **fully functional Home Assistant + Claude.ai integration** that reliably displays and executes all MCP tools.

---

**🤖 Created during the successful troubleshooting session with Claude Code**

*This guide captures the exact solution that resolved the "No tools provided" issue and established working Home Assistant MCP integration with Claude.ai web interface.*