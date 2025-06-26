// Add these fixes to your existing server.js

// 1. Fix the MCP Discovery endpoint to include required OAuth parameters
app.get('/.well-known/mcp', (req, res) => {
    console.log('🔍 MCP Discovery called from:', req.headers['user-agent']);
    console.log('🔍 Origin:', req.headers.origin);
    
    const discoveryResponse = {
        version: "2024-11-05",
        name: "Home Assistant MCP",
        description: "Control and manage Home Assistant",
        sse_url: "https://ha-mcp.right-api.com/sse",
        oauth: {
            authorization_endpoint: "https://ha-mcp.right-api.com/oauth/authorize",
            token_endpoint: "https://ha-mcp.right-api.com/oauth/token",
            registration_endpoint: "https://ha-mcp.right-api.com/oauth/register",
            scopes_supported: ["homeassistant:read", "homeassistant:write"],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
            // Add these required fields for Claude.ai
            issuer: "https://ha-mcp.right-api.com",
            authorization_endpoint_auth_methods_supported: ["none"],
            code_challenge_methods_supported: ["S256", "plain"]
        },
        capabilities: ["entities", "services", "automations"]
    };
    
    console.log('📤 Discovery response sent');
    res.json(discoveryResponse);
});

// 2. Fix CORS to be more specific for Claude.ai
app.use((req, res, next) => {
    const origin = req.headers.origin;
    console.log('🌐 Request from origin:', origin);
    
    // Claude.ai specific origins
    const allowedOrigins = [
        'https://claude.ai',
        'https://app.claude.ai',
        'https://www.claude.ai'
    ];
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        console.log('✅ CORS allowed for:', origin);
    } else if (!origin) {
        // Allow requests without origin (like direct API calls)
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        console.log('❌ CORS rejected for:', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        console.log('🔧 OPTIONS request handled');
        res.status(200).end();
        return;
    }
    
    next();
});

// 3. Add the missing debug endpoints
app.get('/debug/status', (req, res) => {
    const status = {
        timestamp: new Date().toISOString(),
        server_status: 'running',
        environment: {
            HA_URL: HA_URL ? 'configured' : 'missing',
            HA_TOKEN: HA_TOKEN ? 'configured' : 'missing',
            MCP_API_KEY: MCP_API_KEY ? 'configured' : 'missing'
        },
        oauth_stats: {
            registered_clients: clients.size,
            active_tokens: tokens.size,
            pending_codes: codes.size
        },
        recent_clients: Array.from(clients.values()).slice(-3).map(client => ({
            client_id: client.client_id,
            redirect_uris: client.redirect_uris,
            created_at: new Date(client.created_at).toISOString()
        }))
    };
    
    console.log('📊 Status requested:', status);
    res.json(status);
});

// 4. Enhanced OAuth registration with better Claude.ai support
app.post('/oauth/register', (req, res) => {
    console.log('🔐 OAuth registration attempt');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const clientId = crypto.randomUUID();
        const clientSecret = crypto.randomBytes(32).toString('hex');
        
        // Accept Claude.ai redirect URIs
        let redirectUris = req.body.redirect_uris || [];
        
        // If no redirect URIs provided, use common Claude.ai ones
        if (redirectUris.length === 0) {
            redirectUris = [
                'https://claude.ai/oauth/callback',
                'https://app.claude.ai/oauth/callback'
            ];
            console.log('📋 Using default Claude.ai redirect URIs');
        }
        
        const client = {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: redirectUris,
            scope: req.body.scope || 'homeassistant:read homeassistant:write',
            grant_types: ['authorization_code'],
            response_types: ['code'],
            created_at: Date.now()
        };
        
        clients.set(clientId, client);
        
        const response = {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: client.redirect_uris,
            grant_types: client.grant_types,
            response_types: client.response_types,
            scope: client.scope
        };
        
        console.log('✅ Client registered:', clientId);
        console.log('📤 Response:', JSON.stringify(response, null, 2));
        
        res.json(response);
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            error: 'server_error',
            error_description: 'Client registration failed'
        });
    }
});

// 5. Enhanced authorization endpoint with better logging
app.get('/oauth/authorize', (req, res) => {
    console.log('🔐 Authorization request received');
    console.log('Query:', JSON.stringify(req.query, null, 2));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    const { client_id, redirect_uri, scope, state, response_type } = req.query;
    
    // Validate parameters
    if (!client_id || !redirect_uri || !state) {
        console.log('❌ Missing required parameters');
        return res.status(400).send('Missing required parameters: client_id, redirect_uri, state');
    }
    
    const client = clients.get(client_id);
    if (!client) {
        console.log('❌ Client not found:', client_id);
        console.log('📋 Available clients:', Array.from(clients.keys()));
        return res.status(400).send('Invalid client_id');
    }
    
    if (!client.redirect_uris.includes(redirect_uri)) {
        console.log('❌ Invalid redirect_uri:', redirect_uri);
        console.log('📋 Allowed redirect_uris:', client.redirect_uris);
        return res.status(400).send('Invalid redirect_uri');
    }
    
    // Generate authorization code
    const code = crypto.randomBytes(32).toString('hex');
    codes.set(code, { 
        client_id, 
        scope: scope || client.scope, 
        expires: Date.now() + 600000, // 10 minutes
        redirect_uri,
        used: false
    });
    
    console.log('✅ Authorization code generated:', code);
    
    const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
    console.log('📤 Redirecting to:', redirectUrl);
    
    res.redirect(redirectUrl);
});

// 6. Enhanced token endpoint
app.post('/oauth/token', (req, res) => {
    console.log('🔐 Token request received');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;
    
    if (grant_type !== 'authorization_code') {
        console.log('❌ Invalid grant_type:', grant_type);
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    
    const codeData = codes.get(code);
    if (!codeData || codeData.expires < Date.now() || codeData.used) {
        console.log('❌ Invalid/expired/used code:', code);
        return res.status(400).json({ error: 'invalid_grant' });
    }
    
    const client = clients.get(client_id);
    if (!client) {
        console.log('❌ Client not found for token request:', client_id);
        return res.status(400).json({ error: 'invalid_client' });
    }
    
    // Mark code as used
    codeData.used = true;
    codes.set(code, codeData);
    
    // Generate access token
    const accessToken = crypto.randomBytes(32).toString('hex');
    tokens.set(accessToken, { 
        client_id, 
        scope: codeData.scope,
        expires: Date.now() + 3600000, // 1 hour
        created_at: Date.now()
    });
    
    const response = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: codeData.scope
    };
    
    console.log('✅ Token generated successfully');
    console.log('📤 Token response sent');
    
    res.json(response);
});

// 7. Add a simple test page
app.get('/debug/test-auth', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>MCP OAuth Test</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .step { margin: 20px 0; padding: 15px; border-left: 4px solid #007bff; background: #f8f9fa; }
                .success { border-left-color: #28a745; }
                .error { border-left-color: #dc3545; }
                button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 3px; cursor: pointer; margin: 5px; }
            </style>
        </head>
        <body>
            <h1>🔧 MCP OAuth Test Page</h1>
            
            <div class="step">
                <h3>Server Status</h3>
                <button onclick="checkStatus()">Check Status</button>
                <div id="status-result"></div>
            </div>
            
            <div class="step">
                <h3>Test Registration</h3>
                <button onclick="testRegistration()">Test Registration</button>
                <div id="registration-result"></div>
            </div>
            
            <div class="step">
                <h3>Instructions for Claude.ai</h3>
                <p>To add this integration to Claude.ai:</p>
                <ol>
                    <li>Go to Claude.ai Settings → Integrations</li>
                    <li>Add custom integration with URL: <strong>https://ha-mcp.right-api.com</strong></li>
                    <li>Follow the OAuth flow</li>
                </ol>
            </div>

            <script>
                async function checkStatus() {
                    try {
                        const response = await fetch('/debug/status');
                        const data = await response.json();
                        document.getElementById('status-result').innerHTML = 
                            '<pre style="background: #e9ecef; padding: 10px;">' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch (error) {
                        document.getElementById('status-result').innerHTML = 
                            '<span style="color: red;">Error: ' + error.message + '</span>';
                    }
                }

                async function testRegistration() {
                    try {
                        const response = await fetch('/oauth/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                redirect_uris: ['https://claude.ai/oauth/callback'],
                                scope: 'homeassistant:read homeassistant:write'
                            })
                        });
                        const data = await response.json();
                        document.getElementById('registration-result').innerHTML = 
                            '<pre style="background: #e9ecef; padding: 10px;">' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch (error) {
                        document.getElementById('registration-result').innerHTML = 
                            '<span style="color: red;">Error: ' + error.message + '</span>';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

console.log('🔧 Enhanced OAuth debugging loaded');
console.log('🌐 Test page available at: https://ha-mcp.right-api.com/debug/test-auth');
