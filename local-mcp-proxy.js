#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Configuration
const REMOTE_URL = 'https://ha-mcp.right-api.com/mcp';
const API_KEY = 'c5d4265e8319384af9f8e0e3ca503b07da4cf360b7a84acaafe326a249c92c21';

// Create readline interface for stdin/stdout
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// HTTP client for making requests to remote server
const https = require('https');
const url = require('url');

function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(REMOTE_URL);
        const postData = JSON.stringify(data);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-API-Key': API_KEY,
                'User-Agent': 'MCP-Local-Proxy/1.0'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(responseData);
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Handle incoming MCP messages from stdin
rl.on('line', async (line) => {
    try {
        const message = JSON.parse(line);
        console.error(`[DEBUG] Received: ${JSON.stringify(message)}`);
        
        // Forward the message to the remote server
        const response = await makeRequest(message);
        
        // Send response back to stdout
        console.log(JSON.stringify(response));
        console.error(`[DEBUG] Sent: ${JSON.stringify(response)}`);
        
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        
        // Send error response
        const errorResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
                code: -32603,
                message: error.message
            }
        };
        console.log(JSON.stringify(errorResponse));
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.error('[INFO] Shutting down MCP proxy...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error('[INFO] Shutting down MCP proxy...');
    process.exit(0);
});

console.error('[INFO] MCP Local Proxy started');
console.error(`[INFO] Connecting to: ${REMOTE_URL}`);
console.error('[INFO] Ready to forward MCP messages...'); 