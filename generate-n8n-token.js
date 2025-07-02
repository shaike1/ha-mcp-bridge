#!/usr/bin/env node
/**
 * Simple N8N token generator that creates a web interface
 * Run this to get authentication details for N8N MCP integration
 */

import http from 'http';
import url from 'url';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const PORT = 3001;
const MCP_SERVER = 'https://ha-mcp.5173322.xyz';

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/gentoken') {
    if (req.method === 'GET') {
      const html = `<!DOCTYPE html>
<html>
<head>
<title>N8N Token Generator for HA-MCP</title>
<style>
body{font-family:Arial;max-width:600px;margin:50px auto;padding:20px;background:#f5f5f5}
.container{background:white;border-radius:10px;padding:40px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
h1{text-align:center;color:#333}
.form-group{margin:15px 0}
label{display:block;margin-bottom:5px;font-weight:bold;color:#555}
input,textarea{width:100%;padding:12px;border:1px solid #ddd;border-radius:5px;box-sizing:border-box}
button{width:100%;padding:12px;background:#007cba;color:white;border:none;border-radius:5px;cursor:pointer;font-size:16px}
button:hover{background:#005a87}
.result{margin-top:20px;padding:15px;background:#d4edda;border-radius:5px;border:1px solid #c3e6cb}
.error{margin-top:20px;padding:15px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;color:#721c24}
.code{background:#f8f9fa;padding:10px;border-radius:5px;font-family:monospace;margin:10px 0;overflow-x:auto}
.copy-btn{background:#28a745;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;margin:5px 0}
</style>
</head>
<body>
<div class="container">
<h1>🔧 N8N Token Generator</h1>
<p><strong>Generate authentication token for N8N MCP integration</strong></p>
<p>This tool will connect to your HA-MCP server at <code>${MCP_SERVER}</code> and generate the authentication details needed for N8N.</p>

<form id="tokenForm">
<div class="form-group">
<label>Admin Username:</label>
<input type="text" id="adminUser" value="admin" required>
</div>

<div class="form-group">
<label>Admin Password:</label>
<input type="password" id="adminPass" required>
</div>

<div class="form-group">
<label>Home Assistant URL:</label>
<input type="url" id="haUrl" placeholder="https://homeassistant.local:8123" required>
</div>

<div class="form-group">
<label>HA Long-Lived Access Token:</label>
<textarea id="haToken" rows="3" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." required></textarea>
</div>

<button type="submit">Generate N8N Authentication</button>
</form>

<div id="result"></div>
</div>

<script>
document.getElementById('tokenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = {
    adminUser: document.getElementById('adminUser').value,
    adminPass: document.getElementById('adminPass').value,
    haUrl: document.getElementById('haUrl').value,
    haToken: document.getElementById('haToken').value
  };
  
  try {
    document.getElementById('result').innerHTML = '<p>Generating token...</p>';
    
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      document.getElementById('result').innerHTML = 
        '<div class="result">' +
        '<h3>✅ Authentication Generated Successfully!</h3>' +
        '<h4>N8N HTTP Request Configuration:</h4>' +
        '<div class="code">' +
        '<strong>URL:</strong> ' + result.mcpServerUrl + '/<br>' +
        '<strong>Method:</strong> POST<br>' +
        '<strong>Headers:</strong><br>' +
        '&nbsp;&nbsp;Content-Type: application/json<br>' +
        '&nbsp;&nbsp;Cookie: ' + result.cookieHeader + '<br>' +
        '</div>' +
        '<button class="copy-btn" onclick="copyToClipboard(\\'' + result.cookieHeader + '\\')">Copy Cookie</button>' +
        '<h4>Example Request Body (Test Tool):</h4>' +
        '<div class="code">' + JSON.stringify(result.exampleBody, null, 2) + '</div>' +
        '<button class="copy-btn" onclick="copyToClipboard(\\'' + JSON.stringify(result.exampleBody) + '\\')">Copy Body</button>' +
        '<h4>Available MCP Tools (' + result.availableTools.length + '):</h4>' +
        '<div class="code">' + result.availableTools.map(t => t.name).join(', ') + '</div>' +
        '<p><strong>Instructions:</strong></p>' +
        '<ol>' +
        '<li>Copy the Cookie header above</li>' +
        '<li>In N8N, add an HTTP Request node</li>' +
        '<li>Set URL to: ' + result.mcpServerUrl + '/</li>' +
        '<li>Set Method to: POST</li>' +
        '<li>Add the Cookie header</li>' +
        '<li>Use the example body format for MCP tool calls</li>' +
        '</ol>' +
        '</div>';
    } else {
      document.getElementById('result').innerHTML = 
        '<div class="error"><strong>Error:</strong> ' + result.error + '</div>';
    }
  } catch (error) {
    document.getElementById('result').innerHTML = 
      '<div class="error"><strong>Error:</strong> ' + error.message + '</div>';
  }
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Copied to clipboard!');
  });
}
</script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
  }
  
  if (parsedUrl.pathname === '/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { adminUser, adminPass, haUrl, haToken } = JSON.parse(body);
        
        console.log('🔧 Generating N8N token...');
        
        // Step 1: Test HA connection
        console.log('Testing HA connection...');
        const haTest = await fetch(haUrl + '/api/', {
          headers: { 'Authorization': 'Bearer ' + haToken }
        });
        if (!haTest.ok) {
          throw new Error('HA connection failed: ' + haTest.status);
        }
        console.log('✅ HA connection successful');
        
        // Step 2: Perform OAuth login to MCP server
        console.log('Logging into MCP server...');
        const clientId = 'n8n-integration-' + randomUUID();
        const redirectUri = MCP_SERVER + '/callback';
        const state = randomUUID();
        const codeChallenge = randomUUID();
        
        const loginResponse = await fetch(MCP_SERVER + '/oauth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            username: adminUser,
            password: adminPass,
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            ha_host: haUrl,
            ha_token: haToken
          })
        });
        
        console.log('Login response status:', loginResponse.status);
        
        if (!loginResponse.ok) {
          const errorText = await loginResponse.text();
          throw new Error('MCP login failed: ' + loginResponse.status + ' - ' + errorText);
        }
        
        // Step 3: Extract session cookie
        const cookies = loginResponse.headers.get('set-cookie');
        let sessionToken = null;
        if (cookies) {
          const adminSessionMatch = cookies.match(/admin_session=([^;]+)/);
          if (adminSessionMatch) {
            sessionToken = adminSessionMatch[1];
          }
        }
        
        if (!sessionToken) {
          throw new Error('No session token found in response');
        }
        
        console.log('✅ Session token extracted');
        
        // Step 4: Test MCP tools with session
        console.log('Testing MCP tools access...');
        const toolsResponse = await fetch(MCP_SERVER + '/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'admin_session=' + sessionToken
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
          })
        });
        
        const toolsResult = await toolsResponse.json();
        const tools = toolsResult.result?.tools || [];
        
        console.log('✅ Found', tools.length, 'MCP tools');
        
        // Step 5: Generate N8N configuration
        const config = {
          mcpServerUrl: MCP_SERVER,
          sessionToken: sessionToken,
          cookieHeader: 'admin_session=' + sessionToken,
          availableTools: tools,
          exampleBody: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'test_simple',
              arguments: {}
            }
          }
        };
        
        console.log('✅ N8N configuration generated successfully');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
        
      } catch (error) {
        console.error('❌ Token generation failed:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  
  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log('🎯 N8N Token Generator running at:');
  console.log('   http://localhost:' + PORT);
  console.log('');
  console.log('📋 This tool will generate authentication details for N8N MCP integration');
  console.log('   Target MCP Server: ' + MCP_SERVER);
  console.log('');
});