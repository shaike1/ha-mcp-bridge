#!/usr/bin/env node

/**
 * MCP Client Test for HA MCP Server
 * Tests the complete flow: authentication -> tool discovery -> tool calls
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

const SERVER_URL = 'https://test.right-api.com';
const CLIENT_ID = 'test-mcp-client';
const REDIRECT_URI = 'http://localhost:3000/callback';

class MCPClient {
  constructor() {
    this.accessToken = null;
    this.sessionId = crypto.randomUUID();
  }

  // Step 1: Register OAuth client
  async registerClient() {
    console.log('🔧 Registering OAuth client...');
    
    const response = await fetch(`${SERVER_URL}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'MCP Test Client',
        client_uri: 'http://localhost:3000',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      })
    });

    const clientData = await response.json();
    console.log('✅ Client registered:', clientData.client_id);
    return clientData;
  }

  // Step 2: Get authorization URL (would normally open in browser)
  async getAuthUrl() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'mcp',
      state: crypto.randomUUID(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `${SERVER_URL}/oauth/authorize?${params}`;
    console.log('🔗 Authorization URL:', authUrl);
    console.log('ℹ️  Normally you would open this in a browser and login');
    
    return { authUrl, codeVerifier };
  }

  // Step 3: Direct token registration for testing (bypasses OAuth flow)
  async registerTestToken() {
    console.log('🔑 Registering test token directly...');
    
    const response = await fetch(`${SERVER_URL}/tokens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'test_mcp_client_token',
        client_id: CLIENT_ID,
        scope: 'mcp',
        ha_host: 'https://ha.right-api.com',
        ha_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjZDAyZjg1YzViMDY0YTkxODQ4NDY1NDRiM2U0MjEwZCIsImlhdCI6MTc1MDgzNTQwNiwiZXhwIjoyMDY2MTk1NDA2fQ.zc9qKIKE84qGEWd1THhjPzqaH1q7gKRrddQnyMLNkOc'
      })
    });

    if (response.ok) {
      this.accessToken = 'test_mcp_client_token';
      console.log('✅ Test token registered successfully');
      return true;
    } else {
      const error = await response.text();
      console.log('❌ Token registration failed:', error);
      return false;
    }
  }

  // Step 4: Initialize MCP connection
  async initializeMCP() {
    console.log('🚀 Initializing MCP connection...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Mcp-Session-Id': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {}
          },
          clientInfo: {
            name: 'Test MCP Client',
            version: '1.0.0'
          }
        }
      })
    });

    const result = await response.json();
    console.log('✅ MCP initialized:', JSON.stringify(result, null, 2));
    return result;
  }

  // Step 5: List available tools
  async listTools() {
    console.log('🔍 Listing available tools...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Mcp-Session-Id': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    const result = await response.json();
    if (result.result && result.result.tools) {
      console.log(`✅ Found ${result.result.tools.length} tools:`);
      result.result.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    } else {
      console.log('❌ No tools found or error:', result);
    }
    return result;
  }

  // Step 6: Test a simple tool call
  async testSimpleTool() {
    console.log('🧪 Testing simple tool...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Mcp-Session-Id': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'test_simple',
          arguments: {}
        }
      })
    });

    const result = await response.json();
    console.log('✅ Simple tool result:', JSON.stringify(result, null, 2));
    return result;
  }

  // Step 7: Test temperature sensor
  async testTemperatureTool() {
    console.log('🌡️ Testing temperature tool...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Mcp-Session-Id': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_temperature_simple',
          arguments: {}
        }
      })
    });

    const result = await response.json();
    console.log('✅ Temperature tool result:', JSON.stringify(result, null, 2));
    return result;
  }

  // Step 8: Test real sensor data
  async testSensorData() {
    console.log('🔍 Testing real sensor data...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Mcp-Session-Id': this.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'get_sensors',
          arguments: {
            sensor_type: 'temperature'
          }
        }
      })
    });

    const result = await response.json();
    console.log('✅ Real sensor data result:', JSON.stringify(result, null, 2));
    return result;
  }

  // Run complete test suite
  async runTests() {
    console.log('🎯 Starting MCP Client Test Suite\n');
    
    try {
      // Direct token registration for testing
      const tokenRegistered = await this.registerTestToken();
      if (!tokenRegistered) {
        console.log('❌ Could not register test token. Exiting.');
        return;
      }

      console.log('\n' + '='.repeat(50));
      await this.initializeMCP();
      
      console.log('\n' + '='.repeat(50));
      await this.listTools();
      
      console.log('\n' + '='.repeat(50));
      await this.testSimpleTool();
      
      console.log('\n' + '='.repeat(50));
      await this.testTemperatureTool();
      
      console.log('\n' + '='.repeat(50));
      await this.testSensorData();
      
      console.log('\n🎉 All tests completed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new MCPClient();
  client.runTests();
}

export default MCPClient;