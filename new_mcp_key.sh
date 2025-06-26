#!/bin/bash

# Complete Security Test for MCP Server
SERVER_URL="https://ha-mcp.right-api.com"
API_KEY="$NEW_MCP_KEY"  # Use your generated API key

echo "🔒 Complete MCP Server Security Test"
echo "====================================="
echo "Server: $SERVER_URL"
echo "API Key: ${API_KEY:0:8}..."
echo

# Test 1: Unauthenticated access to protected endpoint
echo "Test 1: Unauthenticated access to MCP endpoint"
echo "Expected: HTTP 401 Unauthorized"
response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}')
echo "Result: $response"
echo

# Test 2: API Key authentication
echo "Test 2: API Key authentication"
echo "Expected: HTTP 200 with JSON response"
response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}')
echo "Result: $response"
echo

# Test 3: Invalid API Key
echo "Test 3: Invalid API Key"
echo "Expected: HTTP 401 Unauthorized"
response=$(curl -s -w "HTTP_CODE:%{http_code}" -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-key-12345" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}')
echo "Result: $response"
echo

# Test 4: OAuth Discovery Endpoints (should work without auth)
echo "Test 4: OAuth Discovery Endpoints"
echo "4a. OAuth Authorization Server Metadata:"
curl -s $SERVER_URL/.well-known/oauth-authorization-server | jq -r '.issuer // "ERROR"'

echo "4b. OAuth Protected Resource Metadata:"
curl -s $SERVER_URL/.well-known/oauth-protected-resource | jq -r '.resource // "ERROR"'

echo "4c. MCP Discovery:"
curl -s $SERVER_URL/.well-known/mcp | jq -r '.name // "ERROR"'
echo

# Test 5: OAuth Client Registration
echo "Test 5: OAuth Client Registration"
registration_response=$(curl -s -X POST $SERVER_URL/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["https://example.com/callback"]
  }')

client_id=$(echo $registration_response | jq -r '.client_id // "ERROR"')
client_secret=$(echo $registration_response | jq -r '.client_secret // "ERROR"')

echo "Client ID: $client_id"
echo "Client Secret: ${client_secret:0:8}..."
echo

# Test 6: OAuth Authorization Flow
echo "Test 6: OAuth Authorization Flow"
auth_url="${SERVER_URL}/oauth/authorize?client_id=${client_id}&redirect_uri=https://example.com/callback&response_type=code&state=test123"
echo "Authorization URL: $auth_url"

# Simulate authorization (in real flow, user would authorize)
auth_response=$(curl -s -L "$auth_url")
echo "Authorization response: ${auth_response:0:100}..."
echo

# Test 7: Tool access with API key
echo "Test 7: Tool access with API key"
tools_response=$(curl -s -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 2}')

tool_count=$(echo $tools_response | jq -r '.result.tools | length // 0')
echo "Available tools: $tool_count"
echo "Tools: $(echo $tools_response | jq -r '.result.tools[].name // "ERROR"' | tr '\n' ' ')"
echo

# Test 8: Home Assistant tool execution
echo "Test 8: Home Assistant tool execution"
entities_response=$(curl -s -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "get_lights", "arguments": {}}, "id": 3}')

if echo $entities_response | jq -e '.result.content[0].text' > /dev/null; then
  echo "✅ Home Assistant tool execution successful"
else
  echo "❌ Home Assistant tool execution failed"
  echo "Response: $entities_response"
fi
echo

# Test 9: Health check
echo "Test 9: Health check"
health_response=$(curl -s $SERVER_URL/health)
echo "Health status: $(echo $health_response | jq -r '.status // "ERROR"')"
echo "OAuth enabled: $(echo $health_response | jq -r '.oauth_enabled // false')"
echo "Auth required: $(echo $health_response | jq -r '.auth_required // false')"
echo

# Test 10: Security headers
echo "Test 10: Security headers check"
echo "Security headers:"
curl -I -s $SERVER_URL/health | grep -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection)"
echo

echo "🔒 Security test completed!"
echo
echo "Summary of expected results:"
echo "✅ Test 1: Should return 401 Unauthorized"
echo "✅ Test 2: Should return 200 with JSON response"
echo "✅ Test 3: Should return 401 Unauthorized"
echo "✅ Test 4: Should return valid OAuth/MCP metadata"
echo "✅ Test 5: Should register OAuth client successfully"
echo "✅ Test 6: Should generate authorization URL"
echo "✅ Test 7: Should list available tools"
echo "✅ Test 8: Should execute Home Assistant tools"
echo "✅ Test 9: Should show healthy status with OAuth enabled"
echo "✅ Test 10: Should show security headers"
