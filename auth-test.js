#!/usr/bin/env node
/**
 * Test MCP client with manual authentication simulation
 */

import fetch from 'node-fetch';

const SERVER_URL = 'https://test.right-api.com';

async function testWithManualAuth() {
  console.log('🔐 Testing with manual authentication credentials...\n');
  
  try {
    // Test 1: Try using a session-based approach
    console.log('📝 Step 1: Simulating admin login...');
    
    const loginResponse = await fetch(`${SERVER_URL}/oauth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: 'admin',
        password: 'a0506a70dbaf3486014ceac508d7db2d7607fba8',
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        state: 'test123',
        code_challenge: 'test-challenge',
        code_challenge_method: 'S256',
        ha_host: 'https://ha.right-api.com',
        ha_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjZDAyZjg1YzViMDY0YTkxODQ4NDY1NDRiM2U0MjEwZCIsImlhdCI6MTc1MDgzNTQwNiwiZXhwIjoyMDY2MTk1NDA2fQ.zc9qKIKE84qGEWd1THhjPzqaH1q7gKRrddQnyMLNkOc'
      })
    });
    
    console.log('Login response status:', loginResponse.status);
    const loginText = await loginResponse.text();
    console.log('Login response preview:', loginText.substring(0, 200) + '...');
    
    // Test 2: Check what kind of response we get for tools
    console.log('\n🔧 Step 2: Testing tool discovery without auth...');
    
    const toolsResponse = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    const toolsResult = await toolsResponse.json();
    console.log('Tools response:', JSON.stringify(toolsResult, null, 2));
    
    // Test 3: Check server capabilities
    console.log('\n⚙️ Step 3: Testing server capabilities...');
    
    const capabilitiesResponse = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, prompts: {} },
          clientInfo: { name: 'Test Client', version: '1.0.0' }
        }
      })
    });

    const capabilitiesResult = await capabilitiesResponse.json();
    console.log('Capabilities response:', JSON.stringify(capabilitiesResult, null, 2));
    
  } catch (error) {
    console.error('❌ Auth test failed:', error.message);
  }
}

async function testSSEConnection() {
  console.log('\n📡 Testing SSE connection for tool broadcasting...');
  
  try {
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Mcp-Session-Id': 'test-session-123'
      }
    });
    
    console.log('SSE Response status:', response.status);
    console.log('SSE Headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.body) {
      // Read a small chunk of the SSE stream
      const reader = response.body.getReader();
      const { value } = await reader.read();
      if (value) {
        const chunk = new TextDecoder().decode(value);
        console.log('SSE Data chunk:', chunk.substring(0, 200));
      }
      reader.releaseLock();
    }
    
  } catch (error) {
    console.error('❌ SSE test failed:', error.message);
  }
}

// Run tests
console.log('🎯 Starting MCP Authentication Tests\n');

await testWithManualAuth();
await testSSEConnection();

console.log('\n🎉 Authentication tests completed!');