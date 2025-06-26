#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration from environment variables
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://ha-mcp.right-api.com';
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;

if (!MCP_SERVER_TOKEN) {
    console.error('MCP_SERVER_TOKEN environment variable is required');
    process.exit(1);
}

if (!HA_URL || !HA_TOKEN) {
    console.error('HA_URL and HA_TOKEN environment variables are required');
    process.exit(1);
}

// Parse server URL
const serverUrl = new URL(MCP_SERVER_URL);
const isHttps = serverUrl.protocol === 'https:';
const client = isHttps ? https : http;

// MCP HTTP client
class MCPHttpClient {
    constructor(serverUrl, token, haUrl, haToken) {
        this.serverUrl = serverUrl;
        this.token = token;
        this.haUrl = haUrl;
        this.haToken = haToken;
        this.requestId = 1;
    }

    async sendRequest(method, params = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.serverUrl);
            
            const requestData = {
                jsonrpc: '2.0',
                id: this.requestId++,
                method: method
            };
            
            if (params) {
                requestData.params = params;
            }

            const postData = JSON.stringify(requestData);
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'ha-url': this.haUrl,
                    'ha-token': this.haToken,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = client.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.error) {
                            reject(new Error(response.error.message || 'MCP request failed'));
                        } else {
                            resolve(response.result);
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
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

    async initialize() {
        return this.sendRequest('initialize');
    }

    async listTools() {
        return this.sendRequest('tools/list');
    }

    async callTool(name, arguments_) {
        return this.sendRequest('tools/call', {
            name: name,
            arguments: arguments_
        });
    }

    async listResources() {
        return this.sendRequest('resources/list');
    }

    async listPrompts() {
        return this.sendRequest('prompts/list');
    }
}

// MCP stdio server
class MCPStdioServer {
    constructor(mcpClient) {
        this.mcpClient = mcpClient;
        this.initialized = false;
    }

    async handleRequest(request) {
        const { method, params, id } = request;
        
        try {
            let result;
            
            switch (method) {
                case 'initialize':
                    if (this.initialized) {
                        throw new Error('Server already initialized');
                    }
                    
                    // Initialize the HTTP client
                    const initResult = await this.mcpClient.initialize();
                    this.initialized = true;
                    
                    result = {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {},
                            resources: {},
                            prompts: {}
                        },
                        serverInfo: {
                            name: "HA MCP Bridge (HTTP Wrapper)",
                            version: "1.0.0"
                        }
                    };
                    break;

                case 'tools/list':
                    if (!this.initialized) {
                        throw new Error('Server not initialized');
                    }
                    
                    const toolsResult = await this.mcpClient.listTools();
                    result = toolsResult;
                    break;

                case 'tools/call':
                    if (!this.initialized) {
                        throw new Error('Server not initialized');
                    }
                    
                    const { name, arguments: args } = params;
                    const callResult = await this.mcpClient.callTool(name, args);
                    result = callResult;
                    break;

                case 'resources/list':
                    if (!this.initialized) {
                        throw new Error('Server not initialized');
                    }
                    
                    const resourcesResult = await this.mcpClient.listResources();
                    result = resourcesResult;
                    break;

                case 'prompts/list':
                    if (!this.initialized) {
                        throw new Error('Server not initialized');
                    }
                    
                    const promptsResult = await this.mcpClient.listPrompts();
                    result = promptsResult;
                    break;

                case 'notifications/initialized':
                    return { jsonrpc: "2.0", id, result: null };

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return { jsonrpc: "2.0", id, result };
            
        } catch (error) {
            return {
                jsonrpc: "2.0",
                id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    start() {
        process.stdin.setEncoding('utf8');
        
        let buffer = '';
        
        process.stdin.on('data', async (chunk) => {
            buffer += chunk;
            
            // Process complete JSON-RPC messages
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const request = JSON.parse(line);
                        const response = await this.handleRequest(request);
                        
                        if (response) {
                            process.stdout.write(JSON.stringify(response) + '\n');
                        }
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
        
        process.stdin.on('end', () => {
            process.exit(0);
        });
        
        // Handle process termination
        process.on('SIGINT', () => {
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            process.exit(0);
        });
    }
}

// Start the MCP stdio server
async function main() {
    try {
        const mcpClient = new MCPHttpClient(MCP_SERVER_URL, MCP_SERVER_TOKEN, HA_URL, HA_TOKEN);
        const server = new MCPStdioServer(mcpClient);
        
        // Don't log to stderr as it interferes with stdio communication
        // console.error('Starting MCP HTTP wrapper server...');
        server.start();
        
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

main(); 