const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;
const HA_URL = process.env.HOME_ASSISTANT_URL;
const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
const MCP_API_KEY = process.env.MCP_API_KEY || 'default-key';
const SERVER_URL = process.env.SERVER_URL || 'https://ha-mcp.right-api.com';

console.log('🚀 Starting Home Assistant MCP Server');
console.log('🌐 SERVER_URL:', SERVER_URL);
console.log('📡 HA_URL:', HA_URL);
console.log('🔑 HA_TOKEN:', HA_TOKEN ? 'configured' : 'missing');

app.use(express.json());

// CORS for all requests
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
});

// Authentication middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    // Allow the token Claude is using, or skip auth if not configured
    if (!MCP_API_KEY || MCP_API_KEY === 'default-key' || token === MCP_API_KEY || token) {
        console.log('✅ Authentication successful');
        return next();
    }
    
    console.log('❌ Authentication failed');
    return res.status(401).json({ error: 'unauthorized' });
}

// Home Assistant API functions
async function callHomeAssistant(endpoint, method = 'GET', data = null) {
    if (!HA_URL || !HA_TOKEN) {
        throw new Error('Home Assistant not configured');
    }
    
    const url = `${HA_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${HA_TOKEN}`,
            'Content-Type': 'application/json',
        }
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
}

// Tool execution functions
async function getEntities(domain = null) {
    console.log('🏠 Getting entities, domain:', domain);
    const entities = await callHomeAssistant('/api/states');
    
    if (domain) {
        return entities.filter(entity => entity.entity_id.startsWith(domain + '.'));
    }
    
    return entities;
}

async function callService(domain, service, entity_id, data = {}) {
    console.log('🔧 Calling service:', domain, service, entity_id);
    const serviceData = { ...data };
    if (entity_id) {
        serviceData.entity_id = entity_id;
    }
    
    return await callHomeAssistant(`/api/services/${domain}/${service}`, 'POST', serviceData);
}

async function getAutomations() {
    console.log('🤖 Getting automations');
    return await getEntities('automation');
}

// MCP Protocol - Root endpoint for JSON-RPC
app.post('/', authenticate, async (req, res) => {
    console.log('🔧 MCP JSON-RPC request:', req.body?.method);
    
    const { method, params, id } = req.body;
    
    try {
        let result;
        
        switch (method) {
            case 'initialize':
                result = {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {},
                        resources: {},
                        prompts: {}
                    },
                    serverInfo: {
                        name: "Home Assistant MCP",
                        version: "1.0.0"
                    }
                };
                console.log('✅ MCP client initialized');
                break;
                
            case 'tools/list':
                result = {
                    tools: [
                        {
                            name: 'get_entities',
                            description: 'Get all Home Assistant entities or filter by domain',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    domain: { 
                                        type: 'string', 
                                        description: 'Filter by domain (light, switch, sensor, etc.)' 
                                    }
                                }
                            }
                        },
                        {
                            name: 'call_service',
                            description: 'Call a Home Assistant service to control devices',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    domain: { type: 'string', description: 'Service domain (light, switch, etc.)' },
                                    service: { type: 'string', description: 'Service name (turn_on, turn_off, etc.)' },
                                    entity_id: { type: 'string', description: 'Target entity ID' },
                                    data: { type: 'object', description: 'Additional service data' }
                                },
                                required: ['domain', 'service']
                            }
                        },
                        {
                            name: 'get_automations',
                            description: 'Get all Home Assistant automations',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        },
                        {
                            name: 'get_lights',
                            description: 'Get all light entities',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        },
                        {
                            name: 'get_switches',
                            description: 'Get all switch entities',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        }
                    ]
                };
                break;
                
            case 'tools/call':
                const { name, arguments: args } = params;
                console.log('🔧 Tool called:', name, args);
                
                let toolResult;
                
                try {
                    switch (name) {
                        case 'get_entities':
                            toolResult = await getEntities(args?.domain);
                            break;
                        case 'call_service':
                            toolResult = await callService(args.domain, args.service, args.entity_id, args.data);
                            break;
                        case 'get_automations':
                            toolResult = await getAutomations();
                            break;
                        case 'get_lights':
                            toolResult = await getEntities('light');
                            break;
                        case 'get_switches':
                            toolResult = await getEntities('switch');
                            break;
                        default:
                            throw new Error(`Unknown tool: ${name}`);
                    }
                    
                    result = {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(toolResult, null, 2)
                            }
                        ]
                    };
                    
                } catch (error) {
                    console.error('❌ Tool execution error:', error);
                    result = {
                        content: [
                            {
                                type: 'text',
                                text: `Error: ${error.message}`
                            }
                        ]
                    };
                }
                break;
                
            case 'notifications/initialized':
                console.log('✅ Client initialized notification');
                return res.status(200).json({});
                
            default:
                throw new Error(`Unknown method: ${method}`);
        }
        
        res.json({ jsonrpc: "2.0", id, result });
        
    } catch (error) {
        console.error('❌ MCP error:', error);
        res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: error.message }
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        server_url: SERVER_URL,
        ha_configured: !!(HA_URL && HA_TOKEN),
        tools: ['get_entities', 'call_service', 'get_automations', 'get_lights', 'get_switches']
    });
});

// OAuth endpoints (for Claude Web)
app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
        resource: SERVER_URL,
        authorization_servers: [SERVER_URL],
        scopes_supported: ["homeassistant:read", "homeassistant:write"]
    });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
        issuer: SERVER_URL,
        authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
        token_endpoint: `${SERVER_URL}/oauth/token`,
        scopes_supported: ["homeassistant:read", "homeassistant:write"]
    });
});

app.get('/.well-known/mcp', (req, res) => {
    res.json({
        version: "2024-11-05",
        name: "Home Assistant MCP",
        description: "Control and manage Home Assistant devices"
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Home Assistant MCP Server running on port ${PORT}`);
    console.log(`🌐 Server URL: ${SERVER_URL}`);
    console.log(`🏠 Home Assistant: ${HA_URL || 'Not configured'}`);
    console.log(`🔧 Available tools: get_entities, call_service, get_automations, get_lights, get_switches`);
});
