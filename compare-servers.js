#!/usr/bin/env node

const https = require('https');

async function compareServers() {
    console.log('🔍 Comparing N8N vs HA MCP Server Responses...\n');
    
    const servers = {
        n8n: 'https://n8n-mcp.right-api.com',
        ha: 'https://ha-mcp.right-api.com'
    };
    
    const apiKey = 'c5d4265e8319384af9f8e0e3ca503b07da4cf360b7a84acaafe326a249c92c21';
    
    // Test 1: Compare Initialize Responses
    console.log('1️⃣ Comparing Initialize Responses...');
    const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: true },
            clientInfo: { name: 'Claude', version: '1.0' }
        }
    };
    
    for (const [name, server] of Object.entries(servers)) {
        console.log(`\n📡 ${name.toUpperCase()} Initialize:`);
        try {
            const response = await makeJsonRpcRequest(server, initRequest, apiKey);
            console.log(JSON.stringify(response, null, 2));
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Test 2: Compare Tools List Responses  
    console.log('\n\n2️⃣ Comparing Tools List Responses...');
    const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    };
    
    for (const [name, server] of Object.entries(servers)) {
        console.log(`\n📡 ${name.toUpperCase()} Tools:`);
        try {
            const response = await makeJsonRpcRequest(server, toolsRequest, apiKey);
            if (response.result && response.result.tools) {
                console.log(`Found ${response.result.tools.length} tools:`);
                response.result.tools.forEach((tool, i) => {
                    console.log(`  ${i+1}. ${tool.name}: ${tool.description}`);
                });
                console.log('\nFirst tool full schema:');
                console.log(JSON.stringify(response.result.tools[0], null, 2));
            } else {
                console.log(JSON.stringify(response, null, 2));
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Test 3: Compare SSE Headers
    console.log('\n\n3️⃣ Comparing SSE Headers...');
    for (const [name, server] of Object.entries(servers)) {
        console.log(`\n📡 ${name.toUpperCase()} SSE Headers:`);
        try {
            await testSSEHeaders(server, apiKey);
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    // Test 4: Compare OAuth Discovery
    console.log('\n\n4️⃣ Comparing OAuth Discovery...');
    for (const [name, server] of Object.entries(servers)) {
        console.log(`\n📡 ${name.toUpperCase()} OAuth Discovery:`);
        try {
            const response = await makeGetRequest(`${server}/.well-known/oauth-authorization-server`);
            console.log(JSON.stringify(response, null, 2));
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
}

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
                'Accept': 'application/json, text/event-stream',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'python-httpx/0.27.0' // Mimic Claude.ai
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch (e) {
                    resolve({ raw: responseData });
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function makeGetRequest(url) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'python-httpx/0.27.0'
            }
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

function testSSEHeaders(server, apiKey) {
    return new Promise((resolve) => {
        const url = new URL(server);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: '/',
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'python-httpx/0.27.0'
            }
        };
        
        const req = https.request(options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            console.log('Headers:', JSON.stringify(res.headers, null, 2));
            
            req.destroy();
            resolve();
        });
        
        req.on('error', (error) => {
            console.log('❌ SSE connection failed:', error.message);
            resolve();
        });
        
        req.setTimeout(2000, () => {
            req.destroy();
            resolve();
        });
        
        req.end();
    });
}

compareServers().catch(console.error);