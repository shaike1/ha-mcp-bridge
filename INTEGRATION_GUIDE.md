# MCP Bridge Integration Guide

This guide provides detailed instructions on how to integrate with the `ha-mcp-bridge` using API clients like the Gemini CLI and automation platforms like N8N.

## API Token Management

A prerequisite for any integration is a valid API token. Tokens are used to authenticate your requests to the MCP bridge.

### How Tokens are Handled

- **Tokens are generated dynamically:** They are not predefined or hardcoded in the Docker container.
- **Registration Endpoint:** You create new tokens by making a `POST` request to the `/tokens/register` endpoint.

### Generating a New Token

You can generate a new token using a `curl` command like the one below. This token can then be used in your scripts, N8N workflows, or other clients.

```bash
curl -X POST \
 -H "Content-Type: application/json" \
 -d '{"description":"a-name-for-my-key","scope":"mcp"}' \
 http://localhost:3007/tokens/register
```

The response will contain your new `access_token`:

```json
{
  "access_token": "2c0ef25b-300b-43d8-a0e4-7097a848b31c",
  "token_type": "Bearer",
  "expires_in": 31536000,
  "scope": "mcp",
  "description": "a-name-for-my-key",
  "created_at": "2025-06-30T21:07:44.078Z"
}
```

---

## Integrating with Gemini CLI

The Gemini CLI tool does not require any specific MCP-related configuration on your part. It interacts with the MCP bridge by dynamically constructing and executing shell commands using `curl`.

### How it Works

When asked to perform an action, Gemini determines the correct API endpoint, method, and payload, then executes a command like this:

```bash
# This is an example of a command Gemini would run internally
curl -X POST \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
 -d '{
      "jsonrpc": "2.0",
      "method": "tools/call",
      "id": "gemini-cli-123",
      "params": {
        "name": "get_lights",
        "arguments": {}
      }
    }' \
 http://localhost:3007/message
```

As long as Gemini has access to the bridge's URL and a valid token, it can formulate the necessary requests to interact with your Home Assistant.

---

## Integrating with N8N

The MCP bridge works perfectly with N8N, allowing you to trigger Home Assistant actions from your workflows.

### N8N Configuration Steps

1.  **Add an `HTTP Request` Node** to your workflow.

2.  **Configure the Node Properties** as follows:
    *   **Method:** `POST`
    *   **URL:** Your MCP bridge's message endpoint (e.g., `https://ha-mcp.yourdomain.com/message`).
    *   **Authentication:** `Header Auth`
    *   **Name** (under Header Auth): `Authorization`
    *   **Value** (under Header Auth): `Bearer YOUR_ACCESS_TOKEN_HERE`
        *   **Security Tip:** Store your token in N8N's built-in Credentials store (`Credentials > New > Header Auth`). You can then reference it securely using an expression like `{{ $credentials.MyMcpToken.value }}`.
    *   **Body Content Type:** `JSON`
    *   **Body:** The JSON-RPC payload for the tool you want to call.

### N8N Body Examples

#### Example 1: Get All Lights

This will return a list of all light entities from Home Assistant.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": "n8n-workflow-get-lights",
  "params": {
    "name": "get_lights",
    "arguments": {}
  }
}
```

#### Example 2: Turn On a Specific Light

This will call the `control_lights` service to turn on a dining room light.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": "n8n-workflow-turn-on-light",
  "params": {
    "name": "control_lights",
    "arguments": {
      "entity_id": "switch.shellyplus2pm_3ce90e2f26ac_switch_1",
      "action": "turn_on"
    }
  }
}
```

The output of the `HTTP Request` node will contain the JSON response from the bridge, which you can then parse and use in subsequent N8N nodes.
