#!/bin/bash

# MCP Integration Diagnostics Script
echo "🔍 Home Assistant MCP Integration Diagnostics"
echo "=============================================="

SERVER_URL="https://ha-mcp.right-api.com"

echo ""
echo "📡 Testing Server Connectivity..."
curl -s -I "$SERVER_URL/health" | head -1

echo ""
echo "🔍 Testing MCP Discovery Endpoint..."
curl -s "$SERVER_URL/.well-known/mcp" | jq . 2>/dev/null || curl -s "$SERVER_URL/.well-known/mcp"

echo ""
echo "📊 Testing Server Status..."
curl -s "$SERVER_URL/debug/status" | jq . 2>/dev/null || curl -s "$SERVER_URL/debug/status"

echo ""
echo "🔐 Testing OAuth Client Registration..."
REGISTRATION_RESPONSE=$(curl -s -X POST "$SERVER_URL/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://claude.ai/oauth/callback", "https://app.claude.ai/oauth/callback"],
    "scope": "homeassistant:read homeassistant:write"
  }')

echo "$REGISTRATION_RESPONSE" | jq . 2>/dev/null || echo "$REGISTRATION_RESPONSE"

# Extract client_id for further testing
CLIENT_ID=$(echo "$REGISTRATION_RESPONSE" | jq -r '.client_id' 2>/dev/null)

if [ "$CLIENT_ID" != "null" ] && [ "$CLIENT_ID" != "" ]; then
    echo ""
    echo "✅ Client registered successfully: $CLIENT_ID"
    
    echo ""
    echo "🔗 Testing Authorization URL..."
    AUTH_URL="$SERVER_URL/oauth/authorize?client_id=$CLIENT_ID&redirect_uri=https://claude.ai/oauth/callback&response_type=code&scope=homeassistant:read+homeassistant:write&state=test123"
    echo "Authorization URL: $AUTH_URL"
    
    # Test if authorization endpoint is accessible
    AUTH_RESPONSE=$(curl -s -I "$AUTH_URL" | head -1)
    echo "Authorization endpoint response: $AUTH_RESPONSE"
else
    echo "❌ Client registration failed"
fi

echo ""
echo "🌐 Testing CORS Headers..."
curl -s -I -H "Origin: https://claude.ai" "$SERVER_URL/.well-known/mcp" | grep -i "access-control"

echo ""
echo "📋 Common Issues to Check:"
echo "1. Ensure server is accessible from internet (not localhost)"
echo "2. Check if HTTPS is properly configured"
echo "3. Verify CORS headers allow claude.ai domain"
echo "4. Check server logs for OAuth registration attempts"
echo "5. Ensure all environment variables are set"

echo ""
echo "🔧 Manual Test URLs:"
echo "Discovery: $SERVER_URL/.well-known/mcp"
echo "Status: $SERVER_URL/debug/status"
echo "Test Page: $SERVER_URL/debug/test-auth"
