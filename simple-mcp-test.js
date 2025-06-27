#!/usr/bin/env node
/**
 * Simple MCP Test - Tests tools discovery directly with prompts/list hack
 */

import fetch from 'node-fetch';

const SERVER_URL = 'https://test.right-api.com';

async function testMCPToolsDiscovery() {
  console.log('🎯 Testing MCP Tools Discovery (prompts/list hack)\n');
  
  try {
    // Test the prompts/list method that Claude.ai uses for tool discovery
    console.log('📋 Testing prompts/list for tool discovery...');
    
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'prompts/list',
        params: {}
      })
    });

    const result = await response.json();
    console.log('✅ Prompts/list response:', JSON.stringify(result, null, 2));
    
    if (result.result && result.result.tools) {
      console.log(`\n🔧 Found ${result.result.tools.length} tools via prompts/list:`);
      result.result.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testServerInfo() {
  console.log('\n📊 Testing server info endpoint...');
  
  try {
    const response = await fetch(`${SERVER_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const result = await response.json();
    console.log('✅ Server info:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Server info test failed:', error.message);
  }
}

async function testHealthCheck() {
  console.log('\n🏥 Testing health check...');
  
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const result = await response.json();
    console.log('✅ Health check:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

// Run tests
console.log('🚀 Starting Simple MCP Tests\n');

await testHealthCheck();
await testServerInfo(); 
await testMCPToolsDiscovery();

console.log('\n🎉 Simple tests completed!');