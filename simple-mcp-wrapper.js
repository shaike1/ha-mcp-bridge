#!/usr/bin/env node

const https = require('https');

// Get environment variables
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://ha-mcp.right-api.com';
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

if (!MCP_SERVER_TOKEN || !HA_URL || !HA_TOKEN) {
    console.error('Missing required environment variables');
    process.exit(1);
}

// Simple HTTP request function
function makeRequest(method, params = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(MCP_SERVER_URL);
        
        const requestData = {
            jsonrpc: '2.0',
            id: Math.floor(Math.random() * 10000),
            method: method
        };
        
        if (params) {
            requestData.params = params;
        }

        const postData = JSON.stringify(requestData);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MCP_SERVER_TOKEN}`,
                'ha-url': HA_URL,
                'ha-token': HA_TOKEN,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Parse error: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });

        req.write(postData);
        req.end();
    });
}

// Handle stdio
let buffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
        if (line.trim()) {
            try {
                const request = JSON.parse(line);
                const { method, params, id } = request;
                
                let response;
                
                try {
                    const result = await makeRequest(method, params);
                    response = { jsonrpc: "2.0", id, result: result.result };
                } catch (error) {
                    response = {
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: -32603,
                            message: error.message
                        }
                    };
                }
                
                process.stdout.write(JSON.stringify(response) + '\n');
                
            } catch (error) {
                const errorResponse = {
                    jsonrpc: "2.0",
                    id: null,
                    error: {
                        code: -32700,
                        message: `Parse error: ${error.message}`
                    }
                };
                process.stdout.write(JSON.stringify(errorResponse) + '\n');
            }
        }
    }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0)); 