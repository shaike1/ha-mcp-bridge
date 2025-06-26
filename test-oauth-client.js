const fetch = require('node-fetch');
const readline = require('readline');

const SERVER_URL = 'https://ha-mcp-web.right-api.com';
const HA_URL = 'https://ha.right-api.com';
const HA_TOKEN = process.env.HA_TOKEN;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error_description || data.error || 'Request failed');
        }
        return data;
    } catch (error) {
        console.error('Request failed:', error.message);
        throw error;
    }
}

// Step 1: Register OAuth client
async function registerClient() {
    console.log('\n1. Registering OAuth client...');
    const clientData = await makeRequest(`${SERVER_URL}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_name: 'Test Client',
            redirect_uris: [`${SERVER_URL}/oauth/callback`]
        })
    });
    console.log('Client registered:', clientData);
    return clientData;
}

// Step 2: Get authorization code
async function getAuthorizationCode(clientId, redirectUri) {
    console.log('\n2. Getting authorization code...');
    const authUrl = new URL(`${SERVER_URL}/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'mcp');
    authUrl.searchParams.set('state', 'test-state');

    console.log('Please visit this URL in your browser:', authUrl.toString());
    console.log('After authorization, you will be redirected. Please enter the code from the URL:');
    
    return new Promise((resolve) => {
        rl.question('Authorization code: ', (code) => {
            resolve(code);
        });
    });
}

// Step 3: Exchange code for tokens
async function getTokens(clientId, clientSecret, code, redirectUri) {
    console.log('\n3. Exchanging code for tokens...');
    const tokenData = await makeRequest(`${SERVER_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: redirectUri
        })
    });
    console.log('Tokens received:', {
        access_token: tokenData.access_token.substring(0, 10) + '...',
        refresh_token: tokenData.refresh_token.substring(0, 10) + '...',
        expires_in: tokenData.expires_in
    });
    return tokenData;
}

// Step 4: Test MCP functionality
async function testMCP(accessToken) {
    console.log('\n4. Testing MCP functionality...');
    
    // Test initialization
    console.log('Testing MCP initialization...');
    const initResponse = await makeRequest(`${SERVER_URL}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'ha-url': HA_URL,
            'ha-token': HA_TOKEN
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize'
        })
    });
    console.log('Initialization response:', initResponse);

    // Test getting tools list
    console.log('\nTesting tools list...');
    const toolsResponse = await makeRequest(`${SERVER_URL}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'ha-url': HA_URL,
            'ha-token': HA_TOKEN
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        })
    });
    console.log('Tools list:', toolsResponse);

    // Test getting entities
    console.log('\nTesting get_entities...');
    const entitiesResponse = await makeRequest(`${SERVER_URL}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'ha-url': HA_URL,
            'ha-token': HA_TOKEN
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'get_entities',
                arguments: {}
            }
        })
    });
    console.log('Entities response:', entitiesResponse);
}

// Main test flow
async function runTest() {
    try {
        // Step 1: Register client
        const clientData = await registerClient();
        
        // Step 2: Get authorization code
        const code = await getAuthorizationCode(
            clientData.client_id,
            clientData.redirect_uris[0]
        );
        
        // Step 3: Get tokens
        const tokenData = await getTokens(
            clientData.client_id,
            clientData.client_secret,
            code,
            clientData.redirect_uris[0]
        );
        
        // Step 4: Test MCP
        await testMCP(tokenData.access_token);
        
        console.log('\n✅ OAuth flow and MCP testing completed successfully!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    } finally {
        rl.close();
    }
}

// Run the test
runTest(); 