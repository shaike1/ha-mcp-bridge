#!/usr/bin/env node

import express from 'express';

const PORT = process.env.PORT || 3001;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Simple tools
const tools = [
  {
    name: "get_entities",
    description: "Get Home Assistant entities",
    inputSchema: { type: "object", properties: {}, required: [] }
  }
];

// Root endpoint
app.all('/', (req, res) => {
  if (req.method === 'GET') {
    return res.json({
      name: "Home Assistant MCP",
      version: "1.0.0",
      transport: "http",
      protocol: "2024-11-05"
    });
  }
  
  if (req.method === 'POST') {
    const { method, id } = req.body;
    
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Home Assistant MCP", version: "1.0.0" }
        };
        break;
      case 'tools/list':
        result = { tools };
        break;
      default:
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Method not found" }
        });
    }
    
    return res.json({ jsonrpc: "2.0", id, result });
  }
  
  res.status(405).json({ error: 'Method not allowed' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Minimal MCP Server running on port ${PORT}`);
  console.log(`🌐 URL: ${SERVER_URL}`);
});