const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// OAuth storage
const clients = new Map();
const tokens = new Map();
const codes = new Map();

console.log('🏠 Home Assistant MCP Server with Debug');

// CORS and debugging middleware
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path} from ${req.headers['user-agent']?.substring(0, 50) || 'unknown'}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PKCE helpers
function base64URLEncode(str) {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// MCP Discovery
app.get('/.well-known/mcp', (req, res) => {
    console.log('🔍 MCP Discovery request');
    res.json({
        version: "2024-11-05",
        name: "Home Assistant MCP",
        description: "Control Home Assistant",
        sse_url: "https://ha-mcp.right-api.com/sse",
        oauth: {
            authorization_endpoint: "https://ha-mcp.right-api.com/oauth/authorize",
            token_endpoint: "https://ha-mcp.right-api.com/oauth/token",
            registration_endpoint: "https://ha-mcp.right-api.com/oauth/register",
            scopes_supported: ["homeassistant:read", "homeassistant:write"],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            code_challenge_methods_supported: ["S256", "plain"]
        }
    });
});

// OAuth Registration
app.post('/oauth/register', (req, res) => {
    console.log('🔐 Registration:', JSON.stringify(req.body, null, 2));
    
    const clientId = crypto.randomUUID();
    const clientSecret = crypto.randomBytes(32).toString('hex');
    
    const client = {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: req.body.redirect_uris || ['https://claude.ai/api/mcp/auth_callback'],
        scope: req.body.scope || 'homeassistant:read homeassistant:write'
    };
    
    clients.set(clientId, client);
    console.log('✅ Client registered:', clientId);
    
    res.json({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: client.redirect_uris
    });
});

// Authorization endpoint
app.get('/oauth/authorize', (req, res) => {
    console.log('🔐 Authorization request:', JSON.stringify(req.query, null, 2));
    
    const { client_id, redirect_uri, scope, state, response_type, code_challenge, code_challenge_method } = req.query;
    
    // Auto-register if needed
    if (!clients.has(client_id)) {
        console.log('🔄 Auto-registering client:', client_id);
        clients.set(client_id, {
            client_id,
            client_secret: crypto.randomBytes(32).toString('hex'),
            redirect_uris: [redirect_uri],
            scope: scope || 'homeassistant:read'
        });
    }
    
    const code = crypto.randomBytes(16).toString('hex');
    const codeData = {
        client_id,
        scope,
        redirect_uri,
        expires: Date.now() + 600000,
        used: false
    };
    
    if (code_challenge) {
        codeData.code_challenge = code_challenge;
        codeData.code_challenge_method = code_challenge_method;
        console.log('🔒 PKCE stored');
    }
    
    codes.set(code, codeData);
    console.log('✅ Code generated:', code);
    console.log('📍 Redirecting to:', `${redirect_uri}?code=${code}&state=${state}`);
    
    res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

// Redirect handler (for debugging)
app.get('/authorize', (req, res) => {
    console.log('📍 Redirect from /authorize to /oauth/authorize');
    const queryString = new URLSearchParams(req.query).toString();
    res.redirect(301, `/oauth/authorize?${queryString}`);
});

// Token endpoint  
app.post('/oauth/token', (req, res) => {
    console.log('🎯 TOKEN REQUEST RECEIVED!');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { grant_type, code, client_id, code_verifier, redirect_uri } = req.body;
    
    if (grant_type !== 'authorization_code') {
        console.log('❌ Invalid grant type');
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    
    const codeData = codes.get(code);
    if (!codeData || codeData.used || codeData.expires < Date.now()) {
        console.log('❌ Invalid code');
        return res.status(400).json({ error: 'invalid_grant' });
    }
    
    // PKCE verification
    if (codeData.code_challenge) {
        if (!code_verifier) {
            console.log('❌ Missing code_verifier');
            return res.status(400).json({ error: 'invalid_request' });
        }
        
        const challengeFromVerifier = base64URLEncode(sha256(code_verifier));
        if (challengeFromVerifier !== codeData.code_challenge) {
            console.log('❌ PKCE failed');
            console.log('Expected:', codeData.code_challenge);
            console.log('Got:', challengeFromVerifier);
            return res.status(400).json({ error: 'invalid_grant' });
        }
        
        console.log('✅ PKCE verified');
    }
    
    // Mark code as used
    codeData.used = true;
    codes.set(code, codeData);
    
    const accessToken = crypto.randomBytes(32).toString('hex');
    tokens.set(accessToken, {
        client_id,
        scope: codeData.scope,
        expires: Date.now() + 3600000
    });
    
    codes.delete(code);
    console.log('🎉 ACCESS TOKEN GENERATED:', accessToken);
    
    res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: codeData.scope
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clients: clients.size,
        tokens: tokens.size,
        codes: codes.size
    });
});

// Catch all for debugging
app.use('*', (req, res) => {
    console.log(`❓ Unknown request: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Debug server running on port ${PORT}`);
});
