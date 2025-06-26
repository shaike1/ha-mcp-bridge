const fetch = require('node-fetch');

async function testProxy() {
  const proxyUrl = 'http://localhost:3002';
  const apiKey = 'proxy-claude-key';
  
  console.log('🧪 Testing MCP Proxy...');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${proxyUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    
    // Test MCP discovery
    console.log('2. Testing MCP discovery...');
    const discoveryResponse = await fetch(`${proxyUrl}/.well-known/mcp`);
    const discoveryData = await discoveryResponse.json();
    console.log('✅ MCP discovery:', discoveryData);
    
    // Test MCP initialize
    console.log('3. Testing MCP initialize...');
    const initResponse = await fetch(`${proxyUrl}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });
    
    const initData = await initResponse.json();
    console.log('✅ MCP initialize:', initData);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testProxy(); 