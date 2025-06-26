const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors({
  origin: ['https://claude.ai', 'https://claude-desktop.ai', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3002;
const HA_MCP_URL = process.env.HA_MCP_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'proxy-jwt-secret';
const API_KEY = process.env.API_KEY || 'proxy-api-key';

// Simple API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  if (token !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mcp-proxy' });
});

// MCP Discovery endpoint
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    name: "ha-mcp-proxy",
    version: "2024-11-05",
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
    config_schemas: {}
  });
});

// Proxy MCP requests to main server
app.post('/', authenticateApiKey, async (req, res) => {
  try {
    const response = await fetch(`${HA_MCP_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WebSocket proxy for MCP
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected to proxy');
  
  // Connect to main HA MCP server
  const haWs = new WebSocket(`${HA_MCP_URL.replace('http', 'ws')}/ws`);
  
  haWs.on('open', () => {
    console.log('Connected to HA MCP server');
  });
  
  haWs.on('message', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  
  haWs.on('error', (error) => {
    console.error('HA MCP WebSocket error:', error);
  });
  
  haWs.on('close', () => {
    console.log('HA MCP WebSocket connection closed');
  });
  
  ws.on('message', (data) => {
    if (haWs.readyState === WebSocket.OPEN) {
      haWs.send(data);
    }
  });
  
  ws.on('close', () => {
    console.log('Proxy WebSocket client disconnected');
    haWs.close();
  });
  
  ws.on('error', (error) => {
    console.error('Proxy WebSocket error:', error);
    haWs.close();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 MCP Proxy Server running on port ${PORT}`);
  console.log(`🔗 Proxying to: ${HA_MCP_URL}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...`);
}); 