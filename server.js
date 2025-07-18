#!/usr/bin/env node

import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'crypto';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// HA Configuration - Set from environment variables if available (for add-on),
// otherwise, will be configured via the OAuth login flow.
let HA_HOST = process.env.HA_URL || '';
let HA_API_TOKEN = process.env.HA_TOKEN || '';

// Check if running in a Home Assistant Add-on environment
const IS_ADDON = !!(process.env.HA_URL && process.env.HA_TOKEN);

if (IS_ADDON) {
  console.log('Add-on environment detected. Using HA credentials from environment.');
} else {
  console.log('Standalone mode. HA credentials will be configured via OAuth flow.');
}

console.log('HA_HOST:', HA_HOST ? 'SET' : 'NOT SET');
console.log('HA_API_TOKEN:', HA_API_TOKEN ? '***SET***' : 'NOT SET');

// Persistent storage directory
const DATA_DIR = '/app/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- NEW: Setup Flow ---
const ENV_FILE_PATH = path.join('/app', '.env');

function areCredentialsSet() {
  // Check both environment variables and the .env file
  if (process.env.HA_URL && process.env.HA_TOKEN) {
    return true;
  }
  if (fs.existsSync(ENV_FILE_PATH)) {
    const envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    return envContent.includes('HA_URL=') && envContent.includes('HA_TOKEN=');
  }
  return false;
}

// --- END: New Setup Flow ---

// Session persistence functions
function saveSessionData() {
  const sessionData = {
    adminSessions: Array.from(adminSessions.entries()),
    accessTokens: Array.from(accessTokens.entries()),
    authenticatedSessions: Array.from(authenticatedSessions.entries()),
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(DATA_DIR, 'sessions.json'), JSON.stringify(sessionData, null, 2));
}

function loadSessionData() {
  try {
    // ENABLE SESSION PERSISTENCE: Load cached session data
    console.log('LOADING session persistence - restoring saved sessions');
    
    const sessionFile = path.join(DATA_DIR, 'sessions.json');
    if (fs.existsSync(sessionFile)) {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      console.log(`Loading persistent session data from ${data.savedAt}`);
      
      // Restore admin sessions (filter out expired ones)
      data.adminSessions.forEach(([token, sessionData]) => {
        if (new Date(sessionData.expiresAt) > new Date()) {
          adminSessions.set(token, {
            ...sessionData,
            createdAt: new Date(sessionData.createdAt),
            expiresAt: new Date(sessionData.expiresAt)
          });
        }
      });
      
      // Restore access tokens (filter out expired ones)
      data.accessTokens.forEach(([token, tokenData]) => {
        if (new Date(tokenData.expiresAt) > new Date()) {
          accessTokens.set(token, {
            ...tokenData,
            expiresAt: new Date(tokenData.expiresAt)
          });
        }
      });
      
      // Restore authenticated sessions
      data.authenticatedSessions.forEach(([clientId, authData]) => {
        if (new Date(authData.tokenData.expiresAt) > new Date()) {
          authenticatedSessions.set(clientId, {
            ...authData,
            authenticatedAt: new Date(authData.authenticatedAt),
            tokenData: {
              ...authData.tokenData,
              expiresAt: new Date(authData.tokenData.expiresAt)
            }
          });
        }
      });
      
      console.log(`Restored ${adminSessions.size} admin sessions, ${accessTokens.size} access tokens, ${authenticatedSessions.size} authenticated sessions`);
    }
  } catch (error) {
    console.error('Error loading session data:', error.message);
  }
}

// OAuth storage
const clients = new Map();
const authCodes = new Map();
const accessTokens = new Map();
const sessions = new Map();
const authenticatedSessions = new Map(); // Track OAuth-authenticated sessions

// Admin authentication - hardcoded for testing
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'your_secure_admin_password_hash';
const adminSessions = new Map(); // Track authenticated admin sessions

// ENABLED: Load existing sessions on startup
loadSessionData();
console.log('SESSION PERSISTENCE ENABLED: Sessions will be saved and restored');

console.log('Admin Authentication:');
console.log('Username:', ADMIN_USERNAME);
console.log('Password:', ADMIN_PASSWORD ? '***SET***' : 'NOT SET - USING DEFAULT');

// Generate admin session token with HA connection details
function createAdminSession(haHost, haApiToken) {
  const sessionToken = randomUUID();
  const sessionData = {
    authenticated: true,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    haHost: haHost,
    haApiToken: haApiToken
  };
  adminSessions.set(sessionToken, sessionData);
  saveSessionData(); // Persist immediately
  return sessionToken;
}

// Verify admin session
function verifyAdminSession(sessionToken) {
  const session = adminSessions.get(sessionToken);
  if (!session || session.expiresAt < new Date()) {
    if (session) adminSessions.delete(sessionToken);
    return false;
  }
  return true;
}

// Simple HA API client - uses session-specific credentials
async function haRequest(endpoint, options = {}, sessionToken = null) {
  let haHost = HA_HOST;
  let haApiToken = HA_API_TOKEN;
  
  // If session token provided, use session-specific HA credentials
  if (sessionToken) {
    const session = adminSessions.get(sessionToken);
    if (session && session.haHost && session.haApiToken) {
      haHost = session.haHost;
      haApiToken = session.haApiToken;
    }
  }
  
  if (!haHost || !haApiToken) {
    throw new Error('HA connection not configured. Please complete OAuth setup first.');
  }
  
  const apiUrl = `${haHost}/api${endpoint}`;
  
  const fetch = (await import('node-fetch')).default;
  
  // Add timeout to prevent hanging connections (increased for Claude.ai stability)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${haApiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: controller.signal,
      timeout: 30000,
      ...options
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('HA API request timed out (30s) - try requesting a specific entity or smaller dataset');
    }
    throw error;
  }
}

// Get available Home Assistant tools
async function getTools() {
  return [
    {
      name: "get_entities",
      description: "Get all Home Assistant entities or filter by domain",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Filter by domain (light, switch, sensor, etc.)" }
        },
        required: []
      }
    },
    {
      name: "call_service",
      description: "Call a Home Assistant service to control devices",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Service domain" },
          service: { type: "string", description: "Service name" },
          entity_id: { type: "string", description: "Target entity ID" },
          data: { type: "object", description: "Additional service data" }
        },
        required: ["domain", "service"]
      }
    },
    {
      name: "homeassistant_call_service",
      description: "Call a Home Assistant service to control devices (namespaced version)",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Service domain" },
          service: { type: "string", description: "Service name" },
          entity_id: { type: "string", description: "Target entity ID" },
          data: { type: "object", description: "Additional service data" }
        },
        required: ["domain", "service"]
      }
    },
    {
      name: "get_automations",
      description: "Get all Home Assistant automations",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "get_lights",
      description: "Get all light entities",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "get_switches",
      description: "Get all switch entities",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "get_climate",
      description: "Get climate/HVAC entities (air conditioning, heating) with temperature info",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Specific climate entity ID (optional)" }
        },
        required: []
      }
    },
    {
      name: "get_sensors",
      description: "Get sensor entities including water leak, presence, motion, temperature sensors",
      inputSchema: {
        type: "object",
        properties: {
          sensor_type: { type: "string", description: "Filter by sensor type: water_leak, presence, motion, temperature, all" }
        },
        required: []
      }
    },
    {
      name: "control_lights",
      description: "Control lights - turn on/off, set brightness, change color",
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Light entity ID" },
          action: { type: "string", description: "Action: turn_on, turn_off, toggle" },
          brightness: { type: "number", description: "Brightness 0-255 (for turn_on)" },
          color: { type: "string", description: "Color name or hex code (for turn_on)" }
        },
        required: ["entity_id", "action"]
      }
    },
    {
      name: "get_temperature_simple",
      description: "Get temperature sensors quickly (mock data for testing)",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "test_simple",
      description: "Simple test tool that returns instantly",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    }
  ];
}

// Call a tool - now accepts sessionToken for HA connection
async function callTool(name, args, sessionToken = null) {
  console.log(`🔧 TOOL CALL: ${name}`);
  console.log(`🔧 Tool arguments:`, JSON.stringify(args, null, 2));
  console.log(`🔧 Session token available:`, sessionToken ? 'YES' : 'NO');
  console.log(`Tool args:`, JSON.stringify(args));
  console.log(`Session token:`, sessionToken ? 'PROVIDED' : 'NULL');
  
  try {
    console.log(`Entering switch statement for tool: ${name}`);
    switch (name) {
      case "get_entities":
        console.log('DEBUG: get_entities called with sessionToken:', sessionToken ? 'PROVIDED' : 'NULL');
        console.log('🔍 Starting get_entities - making HA API call to /states');
        try {
          const entities = await haRequest('/states', {}, sessionToken);
          console.log(`🔍 HA API returned ${entities?.length || 0} entities for get_entities`);
        
          let filteredEntities = entities;
        if (args?.domain) {
          filteredEntities = entities.filter(e => e.entity_id.startsWith(args.domain + '.'));
          
          // Create ultra-concise list for Claude.ai compatibility
          const summary = filteredEntities.slice(0, 5).map(e => 
            `${e.attributes.friendly_name || e.entity_id}: ${e.state}`
          ).join('\n');
          
          const moreText = filteredEntities.length > 5 ? `\n... and ${filteredEntities.length - 5} more` : '';
          
          return {
            content: [{
              type: "text",
              text: `Found ${filteredEntities.length} entities in domain '${args.domain}':\n\n${summary}${moreText}`
            }]
          };
        } else {
          // When getting ALL entities, always simplify to prevent timeouts
          const simplified = entities.map(e => ({
            entity_id: e.entity_id,
            state: e.state,
            friendly_name: e.attributes.friendly_name || e.entity_id,
            domain: e.entity_id.split('.')[0]
          }));
          
          // Group by domain for easier reading
          const byDomain = simplified.reduce((acc, entity) => {
            if (!acc[entity.domain]) acc[entity.domain] = [];
            acc[entity.domain].push({
              entity_id: entity.entity_id,
              state: entity.state,
              friendly_name: entity.friendly_name
            });
            return acc;
          }, {});
          
          // Limit response size to prevent Claude.ai timeouts
          const limitedByDomain = {};
          Object.keys(byDomain).slice(0, 10).forEach(domain => {
            limitedByDomain[domain] = byDomain[domain].slice(0, 5);
          });
          
          return {
            content: [{
              type: "text",
              text: `Found ${entities.length} total entities (showing first 10 domains, 5 entities each):\n\n${JSON.stringify(limitedByDomain, null, 2)}\n\nUse domain filter like get_entities(domain: 'light') for full results.`
            }]
          };
        }
        
        return {
          content: [{
            type: "text", 
            text: JSON.stringify(filteredEntities, null, 2)
          }]
        };
        
        }
        catch (error) {
          console.log('❌ Error in get_entities:', error.message);
          return {
            content: [{
              type: "text",
              text: `Error retrieving entities: ${error.message}`
            }]
          };
        }
        
      case "call_service":
      case "homeassistant_call_service":
        const serviceData = { ...args.data };
        if (args.entity_id) serviceData.entity_id = args.entity_id;
        
        const serviceResult = await haRequest(`/services/${args.domain}/${args.service}`, {
          method: 'POST',
          body: JSON.stringify(serviceData)
        }, sessionToken);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(serviceResult, null, 2)
          }]
        };
        
      case "get_automations":
        const allEntities = await haRequest('/states', {}, sessionToken);
        const automations = allEntities.filter(e => e.entity_id.startsWith('automation.'));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(automations, null, 2)
          }]
        };
        
      case "get_lights":
        console.log('🔍 Starting get_lights - making HA API call to /states');
        try {
          const allLightEntities = await haRequest('/states', {}, sessionToken);
          console.log(`🔍 HA API returned ${allLightEntities?.length || 0} entities`);
          
          if (!allLightEntities || !Array.isArray(allLightEntities)) {
            console.log('❌ HA API response is not an array:', typeof allLightEntities);
            return {
              content: [{
                type: "text", 
                text: "Error: Invalid response from Home Assistant API"
              }]
            };
          }
          
          const lights = allLightEntities.filter(e => e.entity_id.startsWith('light.'));
          console.log(`🔍 Found ${lights.length} light entities`);
          
          // Ultra-concise response for Claude.ai compatibility
          if (lights.length === 0) {
            return {
              content: [{
                type: "text",
                text: "No light entities found"
              }]
            };
          }
          
          const summary = lights.slice(0, 5).map(light => 
            `${light.attributes.friendly_name || light.entity_id}: ${light.state}`
          ).join('\n');
          
          const moreText = lights.length > 5 ? `\n... and ${lights.length - 5} more lights` : '';
          
          return {
            content: [{
              type: "text",
              text: `Found ${lights.length} lights:\n${summary}${moreText}`
            }]
          };
        } catch (error) {
          console.log('❌ Error in get_lights:', error.message);
          return {
            content: [{
              type: "text",
              text: `Error retrieving lights: ${error.message}`
            }]
          };
        }
        
      case "get_switches":
        const allSwitchEntities = await haRequest('/states', {}, sessionToken);
        const switches = allSwitchEntities.filter(e => e.entity_id.startsWith('switch.'));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(switches, null, 2)
          }]
        };
        
      case "get_climate":
        if (args.entity_id) {
          // Get specific climate entity
          const climateEntity = await haRequest(`/states/${args.entity_id}`, {}, sessionToken);
          return {
            content: [{
              type: "text", 
              text: JSON.stringify(climateEntity, null, 2)
            }]
          };
        } else {
          // Get all climate entities with timeout protection
          try {
            console.log('🌡️ Starting HA API call for climate entities...');
            const startTime = Date.now();
            const allEntities = await haRequest('/states', {}, sessionToken);
            const elapsed = Date.now() - startTime;
            console.log(`🌡️ HA API call completed in ${elapsed}ms, got ${allEntities.length} entities`);
            const climateEntities = allEntities.filter(e => e.entity_id.startsWith('climate.'));
            console.log(`🌡️ Found ${climateEntities.length} climate entities`);
            
            // Create concise human-readable summary 
            const summary = climateEntities.map(entity => {
              const name = entity.attributes.friendly_name || entity.entity_id;
              const current = entity.attributes.current_temperature;
              const target = entity.attributes.temperature;
              const mode = entity.attributes.hvac_mode || entity.state;
              return `• ${name}: ${current}°C → ${target}°C (${mode})`;
            }).join('\n');
            
            return {
              content: [{
                type: "text",
                text: `Found ${climateEntities.length} climate entities:\n\n${summary}`
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `Climate data temporarily unavailable: ${error.message}`
              }]
            };
          }
        }
        
      case "get_sensors":
        try {
          console.log('DEBUG: get_sensors called');
          
          const allEntities = await haRequest('/states', {}, sessionToken);
          let sensorEntities = allEntities.filter(e => 
            e.entity_id.startsWith('binary_sensor.') || 
            e.entity_id.startsWith('sensor.')
          );
          
          // Filter by sensor type if specified
          if (args?.sensor_type && args.sensor_type !== 'all') {
            const filterMap = {
              'water_leak': (e) => e.entity_id.includes('leak') || e.entity_id.includes('water') || e.attributes.device_class === 'moisture',
              'presence': (e) => e.entity_id.includes('presence') || e.entity_id.includes('occupancy') || e.attributes.device_class === 'occupancy',
              'motion': (e) => e.entity_id.includes('motion') || e.attributes.device_class === 'motion',
              'temperature': (e) => e.attributes.device_class === 'temperature' || e.attributes.unit_of_measurement === '°C'
            };
            
            if (filterMap[args.sensor_type]) {
              sensorEntities = sensorEntities.filter(filterMap[args.sensor_type]);
            }
          }
          
          if (sensorEntities.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No ${args?.sensor_type || 'sensor'} entities found`
              }]
            };
          }
          
          // Limit to first 5 results for faster response
          const summary = sensorEntities.slice(0, 5).map(entity => {
            const name = entity.attributes.friendly_name || entity.entity_id;
            const state = entity.state;
            const unit = entity.attributes.unit_of_measurement || '';
            const deviceClass = entity.attributes.device_class ? `[${entity.attributes.device_class}]` : '';
            return `• ${name}: ${state}${unit} ${deviceClass}`.trim();
          }).join('\n');
          
          return {
            content: [{
              type: "text",
              text: `Found ${sensorEntities.length} sensor entities:\n\n${summary}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Sensor data temporarily unavailable: ${error.message}`
            }]
          };
        }
        
      case "control_lights":
        try {
          console.log('DEBUG: control_lights called with args:', JSON.stringify(args, null, 2));
          
          if (!args?.entity_id || !args?.action) {
            const allEntities = await haRequest('/states', {}, sessionToken);
            const lights = allEntities.filter(e => e.entity_id.startsWith('light.'));
            const lightList = lights.slice(0, 10).map(light => 
              `• ${light.entity_id} (${light.attributes.friendly_name || 'No friendly name'})`
            ).join('\n');
            
            return {
              content: [{
                type: "text",
                text: `Error: Missing required parameters 'entity_id' and 'action'.\n\nAvailable lights:\n${lightList}\n\nExample: control_lights(entity_id: "light.example_light", action: "turn_on")`
              }]
            };
          }
          
          let serviceData = { entity_id: args.entity_id };
          
          if (args.action === 'turn_on') {
            if (args.brightness) serviceData.brightness = args.brightness;
            if (args.color) {
              if (args.color.startsWith('#')) {
                serviceData.hex_color = args.color;
              } else {
                serviceData.color_name = args.color;
              }
            }
          }
          
          console.log('DEBUG: Calling light service with data:', JSON.stringify(serviceData, null, 2));
          
          const result = await haRequest(`/services/light/${args.action}`, {
            method: 'POST',
            body: JSON.stringify(serviceData)
          }, sessionToken);
          
          return {
            content: [{
              type: "text",
              text: `Successfully called service light.${args.action} for entity ${args.entity_id}.`
            }]
          };
        } catch (error) {
          console.error('Error in control_lights:', error.message);
          return {
            content: [{
              type: "text",
              text: `Light control failed: ${error.message}. Please check the entity_id and action.`
            }]
          };
        }
      
      case "get_temperature_simple":
        // Fast mock temperature data to avoid timeouts
        return {
          content: [{
            type: "text",
            text: "🌡️ Temperature sensors:\n• Living Room: 22.5°C [temperature]\n• Bedroom: 20.1°C [temperature]\n• Kitchen: 24.3°C [temperature]\n• Outside: 18.7°C [temperature]"
          }]
        };
        
      case "test_simple":
        return {
          content: [{
            type: "text",
            text: "✅ Test tool working! Server is responding correctly. The MCP connection is stable."
          }]
        };
        
      case "get_climate_simple":
        // Test climate tool without HA API call
        return {
          content: [{
            type: "text",
            text: "🌡️ Mock climate data:\n• Living Room AC: 22°C → 24°C (cooling)\n• Bedroom AC: 20°C → 21°C (heating)\n• Kitchen AC: 23°C → 23°C (auto)"
          }]
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`ERROR in tool ${name}:`, error.message);
    console.error('Error stack:', error.stack);
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
}

// Verify access token
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const tokenData = accessTokens.get(token);
  
  if (!tokenData || tokenData.expiresAt < new Date()) {
    return null;
  }
  
  return tokenData;
}

// Verify session-based authentication for Claude.ai
function verifySessionAuth(sessionId) {
  if (!sessionId) {
    return null;
  }
  
  // Check if this specific session is marked as authenticated
  const sessionData = sessions.get(sessionId);
  if (sessionData && sessionData.authenticated) {
    // Find any valid token data from authenticated sessions
    for (const [clientId, authData] of authenticatedSessions.entries()) {
      if (authData.tokenData.expiresAt > new Date()) {
        return authData.tokenData;
      }
    }
  }
  
  return null;
}

// OAuth and MCP server
const httpServer = http.createServer(async (req, res) => {
  // --- NEW: Setup Flow ---
  if (!areCredentialsSet()) {
    if (req.method === 'POST' && req.url === '/setup') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const ha_url = params.get('ha_url');
        const ha_token = params.get('ha_token');
        
        const envContent = `HA_URL=${ha_url}\nHA_TOKEN=${ha_token}\n`;
        fs.writeFileSync(ENV_FILE_PATH, envContent);
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Credentials saved!</h1><p>Please restart the container to apply the changes.</p>');
      });
      return;
    }
    
    if (req.method === 'GET' && req.url === '/setup.html') {
        const setupPagePath = path.join('/app', 'public', 'setup.html');
        if (fs.existsSync(setupPagePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(setupPagePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Setup page not found.');
        }
        return;
    }

    // Redirect to setup page if credentials are not set
    if (req.url !== '/setup.html') {
        res.writeHead(302, { 'Location': '/setup.html' });
        res.end();
        return;
    }
  }
  // --- END: New Setup Flow ---

  console.log(`${req.method} ${req.url}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  
  // OAuth discovery endpoint
  if (req.method === 'GET' && parsedUrl.pathname === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      issuer: process.env.SERVER_URL || 'https://ha-mcp.right-api.com',
      authorization_endpoint: `${process.env.SERVER_URL || 'https://ha-mcp.right-api.com'}/oauth/authorize`,
      token_endpoint: `${process.env.SERVER_URL || 'https://ha-mcp.right-api.com'}/oauth/token`,
      registration_endpoint: `${process.env.SERVER_URL || 'https://ha-mcp.right-api.com'}/oauth/register`,
      scopes_supported: ['mcp'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256']
    }));
    return;
  }
  
  // Dynamic client registration
  if (req.method === 'POST' && parsedUrl.pathname === '/oauth/register') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const clientRequest = JSON.parse(body);
        const clientId = randomUUID();
        const clientSecret = randomUUID();
        
        clients.set(clientId, {
          id: clientId,
          secret: clientSecret,
          redirectUris: clientRequest.redirect_uris || [],
          createdAt: new Date()
        });
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          client_secret_expires_at: 0
        }));
      } catch (error) {
        res.writeHead(400);
        res.end('Invalid registration request');
      }
    });
    return;
  }
  
  // Token registration endpoint (for pre-registering API tokens)
  if (req.method === 'POST' && parsedUrl.pathname === '/tokens/register') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const tokenRequest = JSON.parse(body);
        const { description, scope } = tokenRequest;
        
        // Generate a new API token
        const apiToken = randomUUID();
        const tokenData = {
          clientId: 'api-client',
          scope: scope || 'mcp',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          resource: process.env.SERVER_URL || 'https://ha-mcp.right-api.com',
          description: description || 'API Token',
          createdAt: new Date()
        };
        
        accessTokens.set(apiToken, tokenData);
        console.log(`Registered new API token: ${description || 'API Token'}`);
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: apiToken,
          token_type: 'Bearer',
          expires_in: 31536000, // 1 year in seconds
          scope: tokenData.scope,
          description: tokenData.description,
          created_at: tokenData.createdAt.toISOString()
        }));
      } catch (error) {
        console.error('Token registration error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'invalid_request',
          error_description: 'Invalid token registration request'
        }));
      }
    });
    return;
  }
  
  // Token management endpoint (list/revoke tokens)
  if (req.method === 'GET' && parsedUrl.pathname === '/tokens') {
    const tokens = [];
    for (const [token, data] of accessTokens.entries()) {
      tokens.push({
        token: token.substring(0, 8) + '...',
        description: data.description,
        scope: data.scope,
        created_at: data.createdAt?.toISOString(),
        expires_at: data.expiresAt.toISOString(),
        client_id: data.clientId
      });
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tokens }));
    return;
  }
  
  if (req.method === 'DELETE' && parsedUrl.pathname.startsWith('/tokens/')) {
    const tokenToRevoke = parsedUrl.pathname.split('/tokens/')[1];
    if (accessTokens.has(tokenToRevoke)) {
      accessTokens.delete(tokenToRevoke);
      console.log(`Revoked token: ${tokenToRevoke}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Token revoked successfully' }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token not found' }));
    }
    return;
  }
  
  // Authorization endpoint
  if (req.method === 'GET' && parsedUrl.pathname === '/oauth/authorize') {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = parsedUrl.query;
    
    // Accept Claude.ai client or any registered client
    let client = clients.get(client_id);
    if (!client) {
      // Auto-register Claude.ai client if not exists
      console.log(`Auto-registering client: ${client_id}`);
      client = {
        id: client_id,
        secret: 'claude-ai-client-secret',
        redirectUris: [redirect_uri],
        createdAt: new Date()
      };
      clients.set(client_id, client);
    }
    
    // Check if user is already authenticated - but force login for new OAuth flows
    const sessionCookie = req.headers.cookie?.split(';')
      .find(c => c.trim().startsWith('admin_session='))
      ?.split('=')[1];
    
    // Check if user has valid session cookie AND it was created after server start
    // This forces fresh login when server restarts
    const serverStartTime = process.uptime() * 1000; // Server uptime in ms
    const sessionValid = sessionCookie && verifyAdminSession(sessionCookie);
    const sessionIsRecent = sessionValid && adminSessions.get(sessionCookie)?.createdAt > Date.now() - serverStartTime;
    
    if (sessionValid && sessionIsRecent) {
      // User is authenticated, show consent page
      const consentPage = `
<!DOCTYPE html>
<html>
<head>
    <title>Authorize HA MCP Access</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .consent-box { border: 2px solid #007cba; border-radius: 10px; padding: 30px; background: #f9f9f9; }
        .app-info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .permissions { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .actions { text-align: center; margin: 30px 0; }
        .btn { padding: 12px 30px; margin: 0 10px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .btn-allow { background: #28a745; color: white; }
        .btn-deny { background: #dc3545; color: white; }
        .btn:hover { opacity: 0.8; }
        .authenticated { background: #d4edda; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="consent-box">
        <div class="authenticated">Authenticated as: ${ADMIN_USERNAME}</div>
        
        <h2>Authorization Request</h2>
        
        <div class="app-info">
            <h3>Application Details:</h3>
            <p><strong>App:</strong> Claude.ai</p>
            <p><strong>Client ID:</strong> ${client_id}</p>
            <p><strong>Redirect URI:</strong> ${redirect_uri}</p>
        </div>
        
        <div class="permissions">
            <h3>Requested Permissions:</h3>
            <ul>
                <li><strong>Home Assistant Device Control</strong> - List, read, and control devices</li>
                <li><strong>Entity Access</strong> - View and manage entities and automations</li>
                <li><strong>Service Calls</strong> - Execute Home Assistant services</li>
            </ul>
        </div>
        
        <p><strong>Warning:</strong> This will give Claude.ai access to control your Home Assistant devices.</p>
        
        <div class="actions">
            <button class="btn btn-allow" onclick="authorize()">Allow Access</button>
            <button class="btn btn-deny" onclick="deny()">Deny Access</button>
        </div>
    </div>
    
    <script>
        function authorize() {
            window.location.href = '/oauth/approve?${new URLSearchParams({
              client_id,
              redirect_uri,
              state,
              code_challenge,
              code_challenge_method,
              scope: scope || 'mcp'
            }).toString()}';
        }
        
        function deny() {
            window.location.href = '${redirect_uri}?error=access_denied&state=${state}';
        }
    </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(consentPage);
      return;
    }
    
    // User not authenticated, show login form
    const loginPage = `
<!DOCTYPE html>
<html>
<head>
    <title>HA MCP Server - Login Required</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; background: #f5f5f5; }
        .login-box { background: white; border-radius: 10px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .title { text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; background: #007cba; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .btn:hover { background: #005a87; }
        .error { color: #dc3545; text-align: center; margin: 15px 0; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h2 class="title">HA MCP Server</h2>
        
        <div class="info">
            <strong>Claude.ai</strong> is requesting access to your Home Assistant devices.
            Please authenticate and configure your HA connection.
        </div>
        
        <form method="POST" action="/oauth/login">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${code_challenge}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
            <input type="hidden" name="scope" value="${scope || 'mcp'}">
            
            <div class="form-group">
                <label for="username">Admin Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            
            <div class="form-group">
                <label for="password">Admin Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <hr style="margin: 20px 0; border: 1px solid #ddd;">
            
            <div class="form-group">
                <label for="ha_host">Home Assistant Host URL:</label>
                <input type="url" id="ha_host" name="ha_host" value="https://ha.right-api.com" placeholder="e.g., http://homeassistant.local:8123" required>
            </div>
            
            <div class="form-group">
                <label for="ha_api_token">Home Assistant API Token:</label>
                <input type="password" id="ha_api_token" name="ha_api_token" placeholder="Your HA Long-Lived Access Token" required>
            </div>
            
            <button type="submit" class="btn">Login &amp; Authorize</button>
        </form>
    </div>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(loginPage);
    return;
  }
  
  // Login endpoint - Process username/password authentication
  if (req.method === 'POST' && parsedUrl.pathname === '/oauth/login') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const params = new URLSearchParams(body);
        const username = params.get('username');
        const password = params.get('password');
        const ha_host = params.get('ha_host');
        const ha_api_token = params.get('ha_api_token');
        const client_id = params.get('client_id');
        const redirect_uri = params.get('redirect_uri');
        const state = params.get('state');
        const code_challenge = params.get('code_challenge');
        const code_challenge_method = params.get('code_challenge_method');
        const scope = params.get('scope');
        
        console.log(`Login attempt for username: ${username}`);
        console.log(`HA Host: ${ha_host}`);
        
        // Validate credentials
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
          console.log('Admin authentication successful');
          
          // Test HA connection before proceeding
          try {
            // Temporarily set connection for testing
            const tempToken = randomUUID();
            adminSessions.set(tempToken, {
              authenticated: true,
              haHost: ha_host,
              haApiToken: ha_api_token,
              expiresAt: new Date(Date.now() + 60000) // 1 minute temp session
            });
            
            // Test the connection
            await haRequest('/states?limit=1', {}, tempToken);
            adminSessions.delete(tempToken); // Clean up temp session
            
            console.log('HA connection test successful');

            // **FIX: Persist the successful HA credentials globally**
            HA_HOST = ha_host;
            HA_API_TOKEN = ha_api_token;
            console.log('Set global HA credentials from successful login');
            
            // Create admin session with HA connection details
            const sessionToken = createAdminSession(ha_host, ha_api_token);
          
          // Set secure session cookie
          const cookieOptions = [
            `admin_session=${sessionToken}`,
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            'Path=/',
            `Max-Age=${30 * 60}` // 30 minutes
          ].join('; ');
          
          // Redirect back to authorization with session cookie
          const redirectUrl = `/oauth/authorize?${new URLSearchParams({
            client_id,
            redirect_uri,
            state,
            code_challenge,
            code_challenge_method,
            scope
          }).toString()}`;
          
          res.writeHead(302, { 
            'Location': redirectUrl,
            'Set-Cookie': cookieOptions
          });
          res.end();
          return;
          } catch (haError) {
            console.log('HA connection failed:', haError.message);
            
            // Show login form with HA connection error
            const haErrorPage = `
<!DOCTYPE html>
<html>
<head>
    <title>HA MCP Server - Connection Failed</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; background: #f5f5f5; }
        .login-box { background: white; border-radius: 10px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .title { text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; background: #007cba; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .btn:hover { background: #005a87; }
        .error { color: #dc3545; text-align: center; margin: 15px 0; background: #f8d7da; padding: 10px; border-radius: 5px; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h2 class="title">HA MCP Server</h2>
        
        <div class="error">HA Connection Failed: ${haError.message}</div>
        
        <div class="info">
            Please check your Home Assistant host URL and API token, then try again.
        </div>
        
        <form method="POST" action="/oauth/login">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${code_challenge}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
            <input type="hidden" name="scope" value="${scope}">
            
            <div class="form-group">
                <label for="username">Admin Username:</label>
                <input type="text" id="username" name="username" value="${username}" required>
            </div>
            
            <div class="form-group">
                <label for="password">Admin Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <hr style="margin: 20px 0; border: 1px solid #ddd;">
            
            <div class="form-group">
                <label for="ha_host">Home Assistant Host URL:</label>
                <input type="url" id="ha_host" name="ha_host" value="${ha_host}" placeholder="https://your-ha-instance.com" required>
            </div>
            
            <div class="form-group">
                <label for="ha_api_token">Home Assistant API Token:</label>
                <input type="password" id="ha_api_token" name="ha_api_token" placeholder="Your HA Long-Lived Access Token" required>
            </div>
            
            <button type="submit" class="btn">Login &amp; Authorize</button>
        </form>
    </div>
</body>
</html>`;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(haErrorPage);
            return;
          }
        } else {
          console.log('Authentication failed - invalid credentials');
          
          // Show login form with error
          const errorPage = `
<!DOCTYPE html>
<html>
<head>
    <title>HA MCP Server - Login Failed</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; background: #f5f5f5; }
        .login-box { background: white; border-radius: 10px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .title { text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; background: #007cba; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .btn:hover { background: #005a87; }
        .error { color: #dc3545; text-align: center; margin: 15px 0; background: #f8d7da; padding: 10px; border-radius: 5px; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h2 class="title">HA MCP Server</h2>
        
        <div class="error">Invalid username or password. Please try again.</div>
        
        <div class="info">
            <strong>Claude.ai</strong> is requesting access to your Home Assistant devices.
            Please authenticate to continue.
        </div>
        
        <form method="POST" action="/oauth/login">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${code_challenge}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
            <input type="hidden" name="scope" value="${scope}">
            
            <div class="form-group">
                <label for="username">Admin Username:</label>
                <input type="text" id="username" name="username" value="${username || ''}" required>
            </div>
            
            <div class="form-group">
                <label for="password">Admin Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <hr style="margin: 20px 0; border: 1px solid #ddd;">
            
            <div class="form-group">
                <label for="ha_host">Home Assistant Host URL:</label>
                <input type="url" id="ha_host" name="ha_host" value="${ha_host || ''}" placeholder="https://your-ha-instance.com" required>
            </div>
            
            <div class="form-group">
                <label for="ha_api_token">Home Assistant API Token:</label>
                <input type="password" id="ha_api_token" name="ha_api_token" placeholder="Your HA Long-Lived Access Token" required>
            </div>
            
            <button type="submit" class="btn">Login &amp; Authorize</button>
        </form>
    </div>
</body>
</html>`;
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(errorPage);
          return;
        }
      } catch (error) {
        console.error('Login processing error:', error);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>400 Bad Request</h1><p>Invalid login request</p>');
      }
    });
    return;
  }
  
  // OAuth approval endpoint (after user clicks "Allow")
  if (req.method === 'GET' && parsedUrl.pathname === '/oauth/approve') {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = parsedUrl.query;
    
    // Get admin session token from cookie
    const sessionCookie = req.headers.cookie?.split(';')
      .find(c => c.trim().startsWith('admin_session='))
      ?.split('=')[1];
    
    // Now generate authorization code after user consent
    const code = randomUUID();
    authCodes.set(code, {
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      scope: scope,
      adminSessionToken: sessionCookie // Link to admin session
    });
    
    console.log(`Created auth code with admin session token: ${sessionCookie ? sessionCookie.substring(0, 8) + '...' : 'null'}`);
    
    console.log(`User approved authorization for client: ${client_id}`);
    
    // Redirect with authorization code
    const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
    res.writeHead(302, { 'Location': redirectUrl });
    res.end();
    return;
  }
  
  // Token endpoint
  if (req.method === 'POST' && parsedUrl.pathname === '/oauth/token') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        console.log('Token exchange request body:', body);
        const params = new URLSearchParams(body);
        const code = params.get('code');
        const clientId = params.get('client_id');
        const codeVerifier = params.get('code_verifier');
        
        console.log('Token exchange params:', { code, clientId, codeVerifier });
        console.log('Available auth codes:', Array.from(authCodes.keys()));
        
        const authCode = authCodes.get(code);
        console.log('Found auth code:', authCode);
        
        if (!authCode) {
          console.log('ERROR: Authorization code not found');
          res.writeHead(400);
          res.end('Authorization code not found');
          return;
        }
        
        if (authCode.expiresAt < new Date()) {
          console.log('ERROR: Authorization code expired');
          res.writeHead(400);
          res.end('Authorization code expired');
          return;
        }
        
        if (authCode.clientId !== clientId) {
          console.log('ERROR: Client ID mismatch');
          res.writeHead(400);
          res.end('Client ID mismatch');
          return;
        }
        
        // Verify PKCE if provided
        if (authCode.codeChallenge && authCode.codeChallengeMethod === 'S256') {
          const hash = createHash('sha256').update(codeVerifier).digest('base64url');
          console.log('PKCE verification:', { 
            provided: authCode.codeChallenge, 
            calculated: hash, 
            matches: hash === authCode.codeChallenge 
          });
          if (hash !== authCode.codeChallenge) {
            console.log('ERROR: PKCE verification failed');
            res.writeHead(400);
            res.end('Invalid code verifier');
            return;
          }
          console.log('PKCE verification successful');
        }
        
        // Generate access token
        const accessToken = randomUUID();
        const tokenData = {
          clientId: clientId,
          scope: authCode.scope,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          resource: SERVER_URL
        };
        accessTokens.set(accessToken, tokenData);
        
        // Store authenticated client for future session verification
        // Use access token as primary key for persistence
        authenticatedSessions.set(accessToken, {
          accessToken: accessToken,
          tokenData: tokenData,
          authenticatedAt: new Date(),
          adminSessionToken: authCode.adminSessionToken, // Link to admin session
          clientId: clientId,
          persistent: true
        });
        
        // Also store by clientId for backwards compatibility
        authenticatedSessions.set(clientId, {
          accessToken: accessToken,
          tokenData: tokenData,
          authenticatedAt: new Date(),
          adminSessionToken: authCode.adminSessionToken,
          clientId: clientId,
          persistent: true
        });
        
        saveSessionData(); // Persist immediately
        
        console.log(`SUCCESS: OAuth completed for client: ${clientId}`);
        console.log(`Generated access token: ${accessToken}`);
        console.log(`Authenticated sessions now: ${authenticatedSessions.size}`);
        console.log(`Access tokens now: ${accessTokens.size}`);
        
        authCodes.delete(code);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 86400,
          scope: authCode.scope
        }));
        console.log('Token response sent successfully');
      } catch (error) {
        console.log('ERROR in token exchange:', error);
        res.writeHead(400);
        res.end('Invalid token request');
      }
    });
    return;
  }
  
  // Health check
  if ((req.method === 'GET' || req.method === 'HEAD') && parsedUrl.pathname === '/health') {
    const health = {
      status: 'healthy',
      server: 'ha-mcp-server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        mcp_bridge: 'running'
      }
    };

    // Check if cloudflared is enabled
    if (process.env.CLOUDFLARED_TOKEN) {
      health.services.cloudflared = 'enabled';
      health.tunnel_status = 'configured';
    } else {
      health.services.cloudflared = 'disabled';
      health.tunnel_status = 'not_configured';
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }
  
  // OpenAI Plugin: /.well-known/ai-plugin.json manifest
  if (req.method === 'GET' && parsedUrl.pathname === '/.well-known/ai-plugin.json') {
    console.log('OpenAI Plugin: ai-plugin.json manifest request');
    
    const manifest = {
      schema_version: "v1",
      name_for_human: "Home Assistant",
      name_for_model: "homeassistant",
      description_for_human: "Control and manage Home Assistant devices through AI",
      description_for_model: "Plugin for accessing Home Assistant devices, entities, and services. Allows listing, reading, and controlling smart home devices.",
      auth: {
        type: "oauth",
        authorization_url: `${SERVER_URL}/oauth/authorize`,
        scope: "mcp"
      },
      api: {
        type: "openapi",
        url: `${SERVER_URL}/tools`,
        is_user_authenticated: true
      },
      logo_url: `${SERVER_URL}/logo.png`,
      contact_email: "admin@ha-mcp.right-api.com",
      legal_info_url: `${SERVER_URL}/legal`
    };
    
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(manifest, null, 2));
    console.log('OpenAI Plugin: Sent ai-plugin.json manifest');
    return;
  }
  
  // OpenAI Plugin: GET /tools endpoint
  if (req.method === 'GET' && parsedUrl.pathname === '/tools') {
    console.log('OpenAI Plugin: GET /tools request');
    
    try {
      const tools = await getTools();
      const openAITools = tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }));
      
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end(JSON.stringify({ tools: openAITools }));
      console.log(`OpenAI Plugin: Sent ${openAITools.length} tools`);
      return;
    } catch (error) {
      console.error('Error generating OpenAI tools:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate tools' }));
      return;
    }
  }
  
  // N8N Token Generator Endpoint
  if (parsedUrl.pathname === '/gentoken') {
    if (req.method === 'GET') {
      const html = '<!DOCTYPE html><html><head><title>N8N Token Generator</title><style>body{font-family:Arial;max-width:600px;margin:50px auto;padding:20px;background:#f5f5f5}.container{background:white;border-radius:10px;padding:40px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}input,textarea{width:100%;padding:12px;margin:5px 0;border:1px solid #ddd;border-radius:5px;box-sizing:border-box}button{width:100%;padding:12px;background:#007cba;color:white;border:none;border-radius:5px;cursor:pointer}.result{margin-top:20px;padding:15px;background:#d4edda;border-radius:5px}</style></head><body><div class="container"><h1>🔧 N8N Token Generator</h1><p>Generate authentication for N8N MCP integration</p><form id="f"><p>Admin Username: <input id="u" value="admin" required></p><p>Admin Password: <input id="p" type="password" required></p><p>HA URL: <input id="h" placeholder="https://homeassistant.local:8123" required></p><p>HA Token: <textarea id="t" placeholder="eyJhbGci..." rows="3" required></textarea></p><button type="submit">Generate</button></form><div id="result"></div></div><script>document.getElementById("f").onsubmit=async(e)=>{e.preventDefault();try{const resp=await fetch("/gentoken",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminUser:document.getElementById("u").value,adminPass:document.getElementById("p").value,haUrl:document.getElementById("h").value,haToken:document.getElementById("t").value})});const data=await resp.json();document.getElementById("result").innerHTML=resp.ok?"<div class=\\"result\\"><h3>✅ Success!</h3><p><strong>Cookie:</strong> "+data.cookieHeader+"</p><p><strong>URL:</strong> "+data.mcpServerUrl+"/</p><p><strong>Tools:</strong> "+data.availableTools.length+"</p></div>":"<div style=\\"color:red\\">Error: "+data.error+"</div>"}catch(err){document.getElementById("result").innerHTML="<div style=\\"color:red\\">Error: "+err.message+"</div>"}};</script></body></html>';
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(html);
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const {adminUser, adminPass, haUrl, haToken} = JSON.parse(body);
          const fetch = (await import('node-fetch')).default;
          const testResp = await fetch(haUrl + '/api/', {headers: {'Authorization': 'Bearer ' + haToken}});
          if (!testResp.ok) throw new Error('HA connection failed');
          const sessionToken = createAdminSession(haUrl, haToken);
          const tools = await getTools();
          const config = {mcpServerUrl: SERVER_URL, sessionToken: sessionToken, cookieHeader: 'admin_session=' + sessionToken, availableTools: tools};
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(config));
        } catch (error) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: error.message}));
        }
      });
      return;
    }
  }
  
  // STREAMABLE HTTP MCP ENDPOINT (2025 spec compliance)
  // RFC: All client→server messages go through /message endpoint
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/message') {
    // STREAMABLE HTTP: Proper transport negotiation per MCP 2025 spec
    const acceptHeader = req.headers.accept || '';
    const supportsSSE = acceptHeader.includes('text/event-stream');
    const supportsJSON = acceptHeader.includes('application/json');
    const userAgent = req.headers['user-agent'] || '';
    
    console.log(`STREAMABLE HTTP 2025: ${req.method} request from ${userAgent}`);
    console.log(`STREAMABLE HTTP 2025: Accept: ${acceptHeader}`);
    console.log(`STREAMABLE HTTP 2025: Transport support - SSE: ${supportsSSE}, JSON: ${supportsJSON}`);
    
    // STREAMABLE HTTP 2025: Handle GET requests for SSE upgrade
    if (req.method === 'GET') {
      console.log('STREAMABLE HTTP 2025: GET request - checking for SSE upgrade');
      console.log('STREAMABLE HTTP 2025: GET request headers:', JSON.stringify(req.headers, null, 2));
      
      if (supportsSSE) {
        console.log('STREAMABLE HTTP 2025: Upgrading to SSE connection');
        
        // SSE Response headers per MCP spec
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
          'Mcp-Transport': 'streamable-http',
          'Mcp-Protocol-Version': '2024-11-05'
        });
        
        // Send SSE connection established event
        res.write('data: {"type":"connection","status":"established"}\n\n');
        
        // Get session ID for duplicate prevention - try header first, then derive from bearer token
        let sessionId = req.headers['mcp-session-id'];
        
        if (!sessionId) {
          // Try to get session from bearer token
          const authHeader = req.headers.authorization;
          console.log(`STREAMABLE HTTP 2025: SSE checking bearer token auth: ${authHeader ? 'present' : 'missing'}`);
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const bearerToken = authHeader.substring(7);
            console.log(`STREAMABLE HTTP 2025: SSE looking up bearer token: ${bearerToken.substring(0, 8)}...`);
            console.log(`STREAMABLE HTTP 2025: SSE authenticated sessions count: ${authenticatedSessions.size}`);
            const authSession = authenticatedSessions.get(bearerToken);
            console.log(`STREAMABLE HTTP 2025: SSE bearer token lookup result: ${authSession ? 'found' : 'not found'}`);
            if (authSession) {
              // Bearer token is valid, use the most recent session ID from active sessions
              // Look for active sessions with this bearer token
              for (const [sessionKey, sessionData] of Object.entries(global.activeSessions || {})) {
                if (sessionData && sessionData.bearerToken === bearerToken) {
                  sessionId = sessionKey;
                  console.log(`STREAMABLE HTTP 2025: SSE using active session ID: ${sessionId}`);
                  break;
                }
              }
              
              if (!sessionId) {
                // Generate a temporary session ID based on bearer token
                sessionId = `sse_${bearerToken.substring(0, 8)}`;
                console.log(`STREAMABLE HTTP 2025: SSE using temporary session ID: ${sessionId}`);
              }
            } else {
              console.log(`STREAMABLE HTTP 2025: SSE auth session not found for bearer token`);
            }
          }
        }
        
        if (!sessionId) {
          console.log('STREAMABLE HTTP 2025: SSE request without session ID or bearer token - skipping tool broadcast');
          // Keep connection alive but don't send tools without session ID (more frequent pings)
          const keepAlive = setInterval(() => {
            res.write('data: {"type":"ping"}\n\n');
          }, 10000);
          
          req.on('close', () => {
            clearInterval(keepAlive);
            console.log('STREAMABLE HTTP 2025: SSE connection closed (no session)');
          });
          return;
        }
        
        // STREAMABLE HTTP 2025: Send tools list as proper MCP notification (avoid duplicates)
        const sessionKey = `sse_${sessionId}`;
        if (!global.sseSent) global.sseSent = new Set();
        
        if (!global.sseSent.has(sessionKey)) {
          global.sseSent.add(sessionKey);
          
          setTimeout(async () => {
            try {
              const tools = await getTools();
              
              // Send tools as a tools/list_changed notification per MCP spec
              const toolsNotification = {
                jsonrpc: '2.0',
                method: 'notifications/tools/list_changed',
                params: {}
              };
              
              console.log(`STREAMABLE HTTP 2025: Sending tools/list_changed notification over SSE (session: ${sessionId})`);
              try {
                res.write(`data: ${JSON.stringify(toolsNotification)}\n\n`);
              } catch (err) {
                console.log('STREAMABLE HTTP 2025: Failed to send tools notification, connection lost');
                return;
              }
              
              // Then send tools as a proper response that Claude should pick up
              const toolsMessage = {
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 'sse-auto-' + Date.now(),
                result: {
                  tools: tools
                }
              };
              
              console.log(`STREAMABLE HTTP 2025: Auto-sending tools/list over SSE (${tools.length} tools, session: ${sessionId})`);
              try {
                res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
              } catch (err) {
                console.log('STREAMABLE HTTP 2025: Failed to send tools list, connection lost');
                return;
              }
              
            } catch (err) {
              console.error('STREAMABLE HTTP 2025: Error sending tools over SSE:', err);
            }
          }, 1000);
        } else {
          console.log(`STREAMABLE HTTP 2025: Skipping duplicate tool broadcast for session ${sessionId}`);
        }
        
        // Keep connection alive with more frequent pings
        const keepAlive = setInterval(() => {
          try {
            res.write('data: {"type":"ping"}\n\n');
          } catch (err) {
            clearInterval(keepAlive);
            console.log('STREAMABLE HTTP 2025: Keep-alive ping failed, connection already closed');
          }
        }, 8000); // Ping every 8 seconds for Claude.ai stability
        
        req.on('close', () => {
          clearInterval(keepAlive);
          // Clear session tracking to allow reconnection
          if (global.sseSent && sessionId) {
            global.sseSent.delete(`sse_${sessionId}`);
          }
          console.log('STREAMABLE HTTP 2025: SSE connection closed');
        });
        
        return;
      } else {
        // GET without SSE support - return server info
        console.log('STREAMABLE HTTP 2025: GET request without SSE - returning server info');
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Mcp-Transport': 'streamable-http',
          'Mcp-Protocol-Version': '2024-11-05'
        });
        res.end(JSON.stringify({
          name: 'HA MCP Server',
          version: '1.0.0',
          description: 'Home Assistant Model Context Protocol Server with Streamable HTTP',
          transport: 'streamable-http',
          protocol: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            prompts: {}
          }
        }));
        return;
      }
    }
    
    // STREAMABLE HTTP 2025: Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      console.log('STREAMABLE HTTP 2025: OPTIONS preflight request');
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Accept',
        'WWW-Authenticate': 'Bearer realm="MCP Server"',
        'Access-Control-Max-Age': '86400',
        'Mcp-Transport': 'streamable-http',
        'Mcp-Protocol-Version': '2024-11-05'
      });
      res.end();
      return;
    }
    
    if (req.method === 'POST') {
      // Debug all headers for POST requests
      console.log('STREAMABLE HTTP 2025: POST request headers:', JSON.stringify(req.headers, null, 2));
      
      // Check authorization for MCP requests - try Bearer token first, then session auth
      console.log('Authorization header:', req.headers.authorization);
      const sessionId = req.headers['mcp-session-id'];
      console.log('Session ID:', sessionId);
      
      // Force authentication if no authorization header
      if (!req.headers.authorization && req.method === 'POST') {
        console.log('No authorization header - forcing OAuth flow');
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="MCP Server", error="invalid_token"'
        });
        res.end(JSON.stringify({
          error: 'unauthorized',
          message: 'Bearer token required. Please complete OAuth flow.'
        }));
        return;
      }

      let tokenData = verifyToken(req.headers.authorization);
      if (!tokenData && sessionId) {
        console.log('Bearer token not found, checking session auth...');
        tokenData = verifySessionAuth(sessionId);
      }
      
      // MCP DISCOVERY: Will check for unauthenticated discovery after body is read
      let allowUnauthenticated = false;
      
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const message = JSON.parse(body);
          console.log('Received MCP message:', JSON.stringify(message, null, 2));
          
          let sessionId = req.headers['mcp-session-id'];
          if (!sessionId && message.method === 'initialize') {
            sessionId = randomUUID();
            console.log(`Created new session: ${sessionId}`);
            
            // If we have any authenticated clients and this is a new session,
            // link it to the admin session from the OAuth flow
            let mostRecentAdminToken = null;
            let mostRecentTime = 0;
            
            // First try to find admin token from persistent authenticated sessions
            if (authenticatedSessions.size > 0) {
              for (const [, authData] of authenticatedSessions.entries()) {
                console.log('Checking authenticated session:', { 
                  hasAdminToken: !!authData.adminSessionToken, 
                  authTime: authData.authenticatedAt,
                  persistent: authData.persistent,
                  tokenValid: authData.tokenData ? new Date(authData.tokenData.expiresAt) > new Date() : false
                });
                if (authData.adminSessionToken && authData.persistent && authData.tokenData && new Date(authData.tokenData.expiresAt) > new Date()) {
                  const authTime = authData.authenticatedAt.getTime();
                  if (authTime > mostRecentTime) {
                    mostRecentTime = authTime;
                    mostRecentAdminToken = authData.adminSessionToken;
                  }
                }
              }
            }
            
            // If no admin token found in authenticated sessions, check admin sessions directly
            if (!mostRecentAdminToken && adminSessions.size > 0) {
              console.log('No admin token in authenticated sessions, checking admin sessions directly');
              for (const [adminToken, adminData] of adminSessions.entries()) {
                console.log('Checking admin session:', { token: adminToken.substring(0, 8) + '...', authenticated: adminData.authenticated, hasHA: !!(adminData.haHost && adminData.haApiToken) });
                if (adminData.authenticated && adminData.haHost && adminData.haApiToken) {
                  const createTime = adminData.createdAt.getTime();
                  if (createTime > mostRecentTime) {
                    mostRecentTime = createTime;
                    mostRecentAdminToken = adminToken;
                  }
                }
              }
            }
            
            if (mostRecentAdminToken) {
              // Store session as authenticated and link to admin session
              sessions.set(sessionId, {
                authenticated: true,
                createdAt: new Date(),
                adminSessionToken: mostRecentAdminToken
              });
              console.log(`SUCCESS: Marked session ${sessionId} as authenticated and linked to admin session ${mostRecentAdminToken.substring(0, 8)}...`);
              console.log(`Admin session HA credentials available: ${adminSessions.get(mostRecentAdminToken)?.haHost ? 'YES' : 'NO'}`);
            } else {
              console.log('WARNING: No admin session with HA credentials found - using environment variables');
              console.log(`Available admin sessions: ${adminSessions.size}`);
              console.log(`Available authenticated sessions: ${authenticatedSessions.size}`);
              if (adminSessions.size > 0) {
                console.log('Admin sessions details:');
                for (const [token, data] of adminSessions.entries()) {
                  console.log(`  Token: ${token.substring(0, 8)}..., Has HA: ${!!(data.haHost && data.haApiToken)}, Authenticated: ${data.authenticated}`);
                }
              }
              // Store as authenticated but without admin token (will use environment variables)
              sessions.set(sessionId, {
                authenticated: true,
                createdAt: new Date()
              });
            }
          }
          
          let response;
          
          if (message.method === 'initialize') {
            // FINAL FIX: Try standard MCP format - capabilities indicate support, tools sent separately
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {
                    listChanged: true
                  },
                  prompts: {}
                },
                serverInfo: {
                  name: 'ha-mcp-server',
                  version: '1.0.0'
                }
              }
            };
            console.log('FINAL FIX: Standard MCP initialize - Claude should request tools/list next');
          } else if (message.method === 'notifications/initialized') {
            // CRITICAL DISCOVERY FIX: Claude.ai never sends initialize, so treat this as the tools request
            console.log('CRITICAL DISCOVERY FIX: Client sent notifications/initialized - treating as tools discovery');
            
            // If no authentication, send tools but include auth requirement in response
            if (!tokenData) {
              console.log('DISCOVERY: Sending tools for unauthenticated discovery, but tools will require auth');
              const tools = await getTools();
              response = {
                jsonrpc: '2.0',
                id: message.id || 'discovery-' + Date.now(),
                result: {
                  tools: tools,
                  _auth_required: true,
                  _auth_url: `${SERVER_URL}/.well-known/oauth-authorization-server`
                }
              };
              console.log(`DISCOVERY: Sent ${tools.length} tools with auth requirement:`, tools.map(t => t.name).join(', '));
            } else {
              const tools = await getTools();
              response = {
                jsonrpc: '2.0',
                id: message.id || 'discovery-' + Date.now(),
                result: {
                  tools: tools
                }
              };
              console.log(`AUTHENTICATED: Sent ${tools.length} tools:`, tools.map(t => t.name).join(', '));
            }
          } else if (message.method === 'prompts/list') {
            // HACK: Since Claude.ai only requests prompts/list and never tools/list,
            // we'll send the tools response when it asks for prompts
            console.log('HACK: Claude.ai requested prompts/list, sending tools instead!');
            const tools = await getTools();
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: tools
              }
            };
            console.log(`HACK: Sending tools response (${tools.length} tools) to prompts/list request`);
            console.log('Tools being sent:', tools.map(t => t.name).join(', '));
          } else if (message.method === 'tools/list') {
            console.log('SUCCESS: Claude.ai is requesting tools/list!');
            const tools = await getTools();
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: tools
              }
            };
            console.log(`SUCCESS: Sending tools response with ${tools.length} tools (unauthenticated discovery)`);
            console.log('Tools being sent:', tools.map(t => t.name).join(', '));
          } else if (message.method === 'tools/call') {
            console.log(`🎯 RECEIVED TOOL CALL: ${message.params?.name || 'UNKNOWN'}`);
            console.log(`🎯 Tool call details:`, JSON.stringify(message.params, null, 2));
            // Get session token from authenticated sessions for HA API access
            let sessionToken = null;
            let sessionData = null;
            if (sessionId) {
              sessionData = sessions.get(sessionId);
              console.log(`MCP Session ${sessionId} data:`, { 
                authenticated: sessionData?.authenticated, 
                hasAdminToken: !!sessionData?.adminSessionToken 
              });
              if (sessionData && sessionData.authenticated && sessionData.adminSessionToken) {
                // Use the admin session token linked to this MCP session
                sessionToken = sessionData.adminSessionToken;
              }
            }
            
            // If no session token from sessionId, try bearer token lookup
            if (!sessionToken && tokenData && req.headers.authorization) {
              console.log('🔍 No session token from sessionId, checking bearer token for admin session...');
              const bearerToken = req.headers.authorization.substring(7); // Remove "Bearer "
              console.log(`🔍 Looking up bearer token: ${bearerToken.substring(0, 8)}...`);
              // Look up authenticated session by bearer token
              const authSession = authenticatedSessions.get(bearerToken);
              if (authSession && authSession.adminSessionToken) {
                sessionToken = authSession.adminSessionToken;
                console.log(`SUCCESS: Found admin session via bearer token: ${sessionToken.substring(0, 8)}...`);
              } else {
                console.log('❌ No authenticated session found for bearer token');
              }
            }
            
            if (sessionToken) {
              const adminSession = adminSessions.get(sessionToken);
              console.log(`SUCCESS: Using admin session token for HA API: ${sessionToken.substring(0, 8)}...`);
              console.log(`Admin session HA Host: ${adminSession?.haHost || 'NOT SET'}`);
              console.log(`Admin session API Token: ${adminSession?.haApiToken ? 'SET' : 'NOT SET'}`);
            } else {
              console.log('WARNING: No admin session token found for this MCP session - will use environment variables');
              console.log(`Session authenticated: ${sessionData?.authenticated}`);
              console.log(`Session has admin token: ${!!sessionData?.adminSessionToken}`);
            }
            
            const result = await callTool(message.params.name, message.params.arguments || {}, sessionToken);
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: result
            };
          } else {
            // ULTIMATE HACK: For any unknown method, send tools
            console.log(`ULTIMATE HACK: Unknown method '${message.method}', sending tools anyway!`);
            const tools = await getTools();
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: tools
              }
            };
            console.log(`ULTIMATE HACK: Sent tools for method '${message.method}' - ${tools.length} tools:`, tools.map(t => t.name).join(', '));
          }
          
          // STREAMABLE HTTP 2025: Set required headers per spec
          if (message.method === 'initialize' && response.result) {
            // MCP 2025 spec: Session ID MUST be set on initialize response
            res.setHeader('Mcp-Session-Id', sessionId);
            console.log(`STREAMABLE HTTP 2025: Set Mcp-Session-Id: ${sessionId}`);
          }
          
          // MCP 2025 spec: Set transport capabilities
          res.setHeader('Mcp-Transport', 'streamable-http');
          res.setHeader('Mcp-Protocol-Version', '2024-11-05');
          
          console.log(`STREAMABLE HTTP 2025: Sending MCP response for method: ${message.method}`);
          
          // STREAMABLE HTTP 2025: Proper response headers
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Accept',
            'Mcp-Transport': 'streamable-http',
            'Mcp-Protocol-Version': '2024-11-05'
          });
          res.end(JSON.stringify(response));
          
        } catch (error) {
          console.error('Error processing MCP message:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error'
            }
          }));
        }
      });
    } else if (req.method === 'GET') {
      const acceptsSSE = req.headers.accept?.includes('text/event-stream') && req.headers.authorization;
      
      if (!acceptsSSE) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: 'HA MCP Server',
          version: '1.0.0',
          description: 'Home Assistant Model Context Protocol Server with OAuth 2.1',
          status: 'running',
          transport: 'Streamable HTTP',
          docs: 'https://github.com/your-repo/ha-mcp-bridge'
        }));
        return;
      }
    }
  }
  
  // Fallback for other routes
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

const PORT = process.env.PORT || 3000;
httpServer.timeout = 60000; // 60 seconds request timeout
httpServer.keepAliveTimeout = 65000; // 65 seconds keep-alive
httpServer.headersTimeout = 66000; // 66 seconds headers timeout

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/`);
  console.log(`OAuth discovery: http://0.0.0.0:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`Server timeouts: request=${httpServer.timeout}ms, keepAlive=${httpServer.keepAliveTimeout}ms`);
});
