const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// MCP Tools
const mcpTools = {
    get_entities: {
        name: 'get_entities',
        description: 'Get all Home Assistant entities or filter by domain',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
            }
        }
    },
    call_service: {
        name: 'call_service',
        description: 'Call a Home Assistant service to control devices',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Service domain' },
                service: { type: 'string', description: 'Service name' },
                entity_id: { type: 'string', description: 'Target entity ID' },
                data: { type: 'object', description: 'Additional service data' }
            },
            required: ['domain', 'service']
        }
    },
    get_automations: {
        name: 'get_automations',
        description: 'Get all Home Assistant automations',
        inputSchema: { type: 'object', properties: {} }
    },
    get_lights: {
        name: 'get_lights',
        description: 'Get all light entities',
        inputSchema: { type: 'object', properties: {} }
    },
    get_switches: {
        name: 'get_switches',
        description: 'Get all switch entities',
        inputSchema: { type: 'object', properties: {} }
    }
};

// Home Assistant API functions
async function callHomeAssistant(endpoint, method = 'GET', data = null, config = null) {
    if (!config?.url || !config?.token) {
        throw new Error('Home Assistant configuration required. Please provide HA URL and token.');
    }

    const url = `${config.url}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        }
    };

    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HA API error: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
        }

        return await response.json();
    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error('Cannot connect to Home Assistant. Please check the URL and ensure HA is running.');
        }
        throw error;
    }
}

// MCP Message Handler
async function handleJsonRpcMessage(body, haConfig = null) {
    const { method, params, id } = body;
    
    let result;

    switch (method) {
        case 'initialize':
            result = {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {}, resources: {}, prompts: {} },
                serverInfo: {
                    name: "HA MCP Bridge (OAuth)",
                    version: "2.0.0",
                    features: ['oauth', 'real-time-config']
                }
            };
            break;

        case 'tools/list':
            result = {
                tools: Object.values(mcpTools)
            };
            break;

        case 'prompts/list':
            result = { prompts: [] };
            break;

        case 'resources/list':
            result = { resources: [] };
            break;

        case 'tools/call':
            if (!haConfig) {
                throw new Error('Home Assistant configuration required for tool calls.');
            }

            const { name, arguments: args } = params;

            try {
                let toolResult;
                const entities = await callHomeAssistant('/api/states', 'GET', null, haConfig);

                switch (name) {
                    case 'get_entities':
                        toolResult = args?.domain ? 
                            entities.filter(e => e.entity_id.startsWith(args.domain + '.')) : 
                            entities;
                        break;
                    case 'call_service':
                        const serviceData = { ...args.data };
                        if (args.entity_id) serviceData.entity_id = args.entity_id;
                        toolResult = await callHomeAssistant(`/api/services/${args.domain}/${args.service}`, 'POST', serviceData, haConfig);
                        break;
                    case 'get_automations':
                        toolResult = entities.filter(e => e.entity_id.startsWith('automation.'));
                        break;
                    case 'get_lights':
                        toolResult = entities.filter(e => e.entity_id.startsWith('light.'));
                        break;
                    case 'get_switches':
                        toolResult = entities.filter(e => e.entity_id.startsWith('switch.'));
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
                result = {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing ${name}: ${error.message}`
                        }
                    ]
                };
            }
            break;

        case 'notifications/initialized':
            return {};

        default:
            throw new Error(`Unknown JSON-RPC method: ${method}`);
    }

    return { jsonrpc: "2.0", id, result };
}

module.exports = {
    handleJsonRpcMessage,
    callHomeAssistant
}; 