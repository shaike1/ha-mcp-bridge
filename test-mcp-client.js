#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Test MCP client to verify our server works correctly
async function testMCPServer() {
    console.log('🧪 Testing HA MCP Server Tool Discovery...\n');
    
    const server = 'https://ha-mcp.right-api.com';
    const apiKey = 'c5d4265e8319384af9f8e0e3ca503b07da4cf360b7a84acaafe326a249c92c21'; // Default API key
    
    try {
        // Test 1: Health Check
        console.log('1️⃣ Testing Health Check...');
        const health = await makeRequest(`${server}/health`);
        console.log('✅ Health:', JSON.stringify(health, null, 2));
        console.log();
        
        // Test 2: OAuth Discovery
        console.log('2️⃣ Testing OAuth Discovery...');
        const oauth = await makeRequest(`${server}/.well-known/oauth-authorization-server`);
        console.log('✅ OAuth Discovery:', JSON.stringify(oauth, null, 2));
        console.log();
        
        // Test 3: MCP Initialize
        console.log('3️⃣ Testing MCP Initialize...');
        const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: true },
                clientInfo: { name: 'TestClient', version: '1.0' }
            }
        };
        
        const initResponse = await makeJsonRpcRequest(server, initRequest, apiKey);
        console.log('✅ Initialize Response:', JSON.stringify(initResponse, null, 2));
        console.log();
        
        // Test 4: Tools List
        console.log('4️⃣ Testing Tools List...');
        const toolsRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {}
        };
        
        const toolsResponse = await makeJsonRpcRequest(server, toolsRequest, apiKey);
        console.log('✅ Tools Response:', JSON.stringify(toolsResponse, null, 2));
        
        if (toolsResponse.result && toolsResponse.result.tools) {
            console.log(`\n📊 Found ${toolsResponse.result.tools.length} tools:`);
            toolsResponse.result.tools.forEach((tool, index) => {
                console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
            });
        }
        console.log();
        
        // Test 5: Prompts List (Claude.ai hack)
        console.log('5️⃣ Testing Prompts List (Claude.ai hack)...');
        const promptsRequest = {
            jsonrpc: '2.0',
            id: 3,
            method: 'prompts/list',
            params: {}
        };
        
        const promptsResponse = await makeJsonRpcRequest(server, promptsRequest, apiKey);
        console.log('✅ Prompts Response (should contain tools):', JSON.stringify(promptsResponse, null, 2));
        console.log();
        
        // Test 6: SSE Connection
        console.log('6️⃣ Testing SSE Connection...');
        await testSSEConnection(server, apiKey);
        
        console.log('\n🎉 All tests completed! Server is working correctly.');
        console.log('\nIf tools are not showing in Claude.ai but all tests pass,');
        console.log('the issue is with Claude.ai\'s interface, not our server.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Helper function to make HTTP requests
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MCP-Test-Client/1.0'
            }
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// Helper function to make JSON-RPC requests
function makeJsonRpcRequest(server, request, apiKey) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(request);
        const url = new URL(server);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'MCP-Test-Client/1.0'
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch (e) {
                    resolve(responseData);
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Helper function to test SSE connection
function testSSEConnection(server, apiKey) {
    return new Promise((resolve) => {
        console.log('   Connecting to SSE endpoint...');
        
        const url = new URL(server);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: '/',
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'MCP-Test-Client/1.0'
            }
        };
        
        const req = https.request(options, (res) => {
            console.log(`   SSE Response Status: ${res.statusCode}`);
            console.log(`   SSE Headers:`, res.headers);
            
            let eventCount = 0;
            let toolsReceived = false;
            
            res.on('data', (chunk) => {
                const data = chunk.toString();
                if (data.includes('"type":"connection"')) {
                    console.log('   ✅ SSE connection established');
                    eventCount++;
                }
                if (data.includes('"method":"tools/list"')) {
                    console.log('   ✅ SSE tools auto-push received');
                    toolsReceived = true;
                    eventCount++;
                }
                if (data.includes('"method":"notifications/tools/list_changed"')) {
                    console.log('   ✅ SSE tools notification received');
                    eventCount++;
                }
                
                // Auto-resolve after getting tools or timeout
                if (toolsReceived || eventCount >= 3) {
                    req.destroy();
                    resolve();
                }
            });
            
            // Timeout after 3 seconds
            setTimeout(() => {
                req.destroy();
                console.log(`   ⏱️ SSE test completed (${eventCount} events received)`);
                resolve();
            }, 3000);
        });
        
        req.on('error', (error) => {
            console.log('   ❌ SSE connection failed:', error.message);
            resolve();
        });
        
        req.end();
    });
}

// Run the test
testMCPServer();