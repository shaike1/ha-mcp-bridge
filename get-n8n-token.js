#!/usr/bin/env node
/**
 * Automated OAuth flow for N8N MCP integration
 * Extracts authentication token for use in N8N workflows
 */

import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import readline from 'readline';

const SERVER_URL = 'https://ha-mcp.5173322.xyz';

// CLI input helper
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getN8NAuthToken() {
  console.log('🔐 Automating OAuth flow for N8N MCP Integration\n');
  
  try {
    // Step 1: Get admin credentials
    console.log('📝 Step 1: Admin Credentials');
    const adminUser = await askQuestion('Enter admin username (default: admin): ') || 'admin';
    const adminPass = await askQuestion('Enter admin password: ');
    
    // Step 2: Get HA credentials 
    console.log('\n🏠 Step 2: Home Assistant Credentials');
    const haUrl = await askQuestion('Enter HA URL (e.g., https://homeassistant.local:8123): ');
    const haToken = await askQuestion('Enter HA Long-Lived Access Token: ');
    
    // Step 3: Generate OAuth parameters
    const clientId = 'n8n-integration-' + randomUUID();
    const redirectUri = SERVER_URL + '/callback';
    const state = randomUUID();
    const codeChallenge = randomUUID();
    
    console.log('\n🔑 Step 3: Performing OAuth Login...');
    
    // Step 4: Perform OAuth login
    const loginResponse = await fetch(`${SERVER_URL}/oauth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }
    
    // Step 5: Extract session/token information
    const loginText = await loginResponse.text();
    const cookies = loginResponse.headers.get('set-cookie');
    
    console.log('\n🍪 Step 4: Extracting Authentication Info...');
    
    // Try to extract session token from cookies
    let sessionToken = null;
    if (cookies) {
      const sessionMatch = cookies.match(/session=([^;]+)/);
      if (sessionMatch) {
        sessionToken = sessionMatch[1];
      }
    }
    
    // Step 6: Test MCP connection with extracted credentials
    console.log('\n🔧 Step 5: Testing MCP Tools Access...');
    
    const testHeaders = {
      'Content-Type': 'application/json'
    };
    
    if (sessionToken) {
      testHeaders['Cookie'] = `session=${sessionToken}`;
    }
    
    const toolsResponse = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });
    
    const toolsResult = await toolsResponse.json();
    
    if (toolsResult.result && toolsResult.result.tools) {
      console.log('✅ MCP Tools discovered:', toolsResult.result.tools.length, 'tools');
      
      // Step 7: Generate N8N configuration
      console.log('\n📋 Step 6: N8N Configuration Details:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('MCP Server URL:', SERVER_URL);
      console.log('Authentication Method: Session Cookie');
      console.log('Cookie Header:', `session=${sessionToken}`);
      console.log('Available Tools:', toolsResult.result.tools.map(t => t.name).join(', '));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Step 8: Generate N8N HTTP Request template
      console.log('\n🔧 N8N HTTP Request Configuration:');
      console.log('URL:', SERVER_URL + '/');
      console.log('Method: POST');
      console.log('Headers:');
      console.log('  Content-Type: application/json');
      console.log('  Cookie: session=' + sessionToken);
      console.log('Body (for tool call):');
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'test_simple',
          arguments: {}
        }
      }, null, 2));
      
      // Step 9: Save configuration to file
      const config = {
        mcpServerUrl: SERVER_URL,
        sessionToken: sessionToken,
        availableTools: toolsResult.result.tools,
        n8nTemplate: {
          url: SERVER_URL + '/',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `session=${sessionToken}`
          },
          bodyTemplate: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'TOOL_NAME_HERE',
              arguments: {}
            }
          }
        }
      };
      
      const fs = await import('fs');
      fs.writeFileSync('n8n-mcp-config.json', JSON.stringify(config, null, 2));
      console.log('\n💾 Configuration saved to: n8n-mcp-config.json');
      
    } else {
      console.log('❌ No tools found. Check credentials and try again.');
      console.log('Response:', JSON.stringify(toolsResult, null, 2));
    }
    
  } catch (error) {
    console.error('❌ OAuth flow failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the OAuth flow
console.log('🎯 Starting Automated OAuth Flow for N8N Integration\n');
await getN8NAuthToken();
console.log('\n🎉 OAuth flow completed!');