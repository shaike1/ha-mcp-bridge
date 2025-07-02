#!/usr/bin/env node
/**
 * Manual token generation for N8N when main server is down
 */

import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const SERVER_URL = 'https://ha-mcp.5173322.xyz';

async function generateToken() {
  try {
    console.log('🔧 Manual Token Generation for N8N');
    console.log('Target server:', SERVER_URL);
    
    // Test if server is responding
    console.log('\n1. Testing server connectivity...');
    try {
      const testResponse = await fetch(SERVER_URL + '/', { timeout: 5000 });
      console.log('Server status:', testResponse.status);
    } catch (error) {
      console.log('❌ Server not responding:', error.message);
      console.log('\n🛠️  Try these steps:');
      console.log('1. Check if the Docker container is running: docker ps | grep ha-mcp');
      console.log('2. Check container logs: docker logs ha-mcp-bridge');
      console.log('3. Restart the container: docker restart ha-mcp-bridge');
      console.log('4. Wait 30 seconds and try again');
      return;
    }
    
    console.log('✅ Server is responding');
    
    // Instructions for manual setup
    console.log('\n📋 N8N Manual Setup Instructions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Since automated token generation failed, use this manual approach:');
    console.log('');
    console.log('1. Visit https://ha-mcp.5173322.xyz in your browser');
    console.log('2. Complete the OAuth login with your admin credentials');
    console.log('3. Open browser DevTools (F12) → Application → Cookies');
    console.log('4. Copy the "admin_session" cookie value');
    console.log('');
    console.log('5. In N8N, add HTTP Request node with:');
    console.log('   URL: https://ha-mcp.5173322.xyz/');
    console.log('   Method: POST');
    console.log('   Headers:');
    console.log('     Content-Type: application/json');
    console.log('     Cookie: admin_session=YOUR_COPIED_VALUE');
    console.log('   Body:');
    console.log('   {');
    console.log('     "jsonrpc": "2.0",');
    console.log('     "id": 1,');
    console.log('     "method": "tools/call",');
    console.log('     "params": {');
    console.log('       "name": "test_simple",');
    console.log('       "arguments": {}');
    console.log('     }');
    console.log('   }');
    console.log('');
    console.log('6. Available MCP tools include:');
    console.log('   - get_entities, call_service, get_automations');
    console.log('   - get_lights, get_switches, get_climate, get_sensors');
    console.log('   - control_lights, get_temperature_simple, test_simple');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

generateToken();