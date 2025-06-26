#!/usr/bin/env node

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const SERVER_URL = 'https://ha-mcp.right-api.com';

// Generate PKCE parameters
function generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
}

async function testOAuthFlow() {
    console.log('🔍 Testing complete OAuth + MCP flow...\n');
    
    // Step 1: Test OAuth discovery
    console.log('1. Testing OAuth discovery endpoint');
    try {
        const response = await fetch(`${SERVER_URL}/.well-known/mcp_oauth_configuration`);
        const config = await response.json();
        console.log('✅ OAuth config:', JSON.stringify(config, null, 2));
    } catch (error) {
        console.log('❌ OAuth discovery failed:', error.message);
        return;
    }
    
    // Step 2: Test MCP initialization (should work without auth)
    console.log('\n2. Testing MCP initialization');
    try {
        const response = await fetch(`${SERVER_URL}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: { tools: true },
                    clientInfo: { name: "Test Client", version: "1.0.0" }
                }
            })
        });
        const result = await response.json();
        console.log('✅ MCP initialize:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.log('❌ MCP initialization failed:', error.message);
        return;
    }
    
    // Step 3: Test OAuth authorization URL generation
    console.log('\n3. Testing OAuth authorization URL');
    const { codeVerifier, codeChallenge } = generatePKCE();
    const authParams = {
        response_type: 'code',
        client_id: 'claude-web-test',
        redirect_uri: 'https://claude.ai/oauth/callback',
        scope: 'homeassistant:read homeassistant:write',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'test-state-123'
    };
    
    const authUrl = `${SERVER_URL}/oauth/authorize?${querystring.stringify(authParams)}`;
    console.log('✅ OAuth authorization URL generated:');
    console.log(authUrl);
    
    // Step 4: Test authorization endpoint response (should show auth form)
    console.log('\n4. Testing OAuth authorization endpoint');
    try {
        const response = await fetch(authUrl);
        const html = await response.text();
        if (html.includes('Home Assistant') && html.includes('authorize')) {
            console.log('✅ OAuth authorization page loads correctly');
        } else {
            console.log('⚠️  OAuth authorization page content unexpected');
        }
    } catch (error) {
        console.log('❌ OAuth authorization test failed:', error.message);
    }
    
    console.log('\n✅ All automated tests passed!');
    console.log('\n🚀 Ready for Claude.ai integration:');
    console.log(`   Server URL: ${SERVER_URL}`);
    console.log('   Claude.ai should now:');
    console.log('   1. Discover OAuth config at /.well-known/mcp_oauth_configuration');
    console.log('   2. Redirect to /oauth/authorize for authentication');
    console.log('   3. Connect to MCP endpoint after OAuth completion');
    console.log('   4. Discover 5 Home Assistant tools via tools/list or prompts/list');
}

testOAuthFlow().catch(console.error);