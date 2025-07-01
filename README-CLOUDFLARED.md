# Cloudflared Integration for HA MCP Bridge

This container now supports Cloudflared tunnels for secure external access without port forwarding.

## Setup Instructions

### 1. Create a Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** > **Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** as the connector
5. Give your tunnel a name (e.g., "ha-mcp-bridge")
6. Copy the tunnel token

### 2. Configure the Container

Set the `CLOUDFLARED_TOKEN` environment variable in your docker-compose.yml:

```yaml
environment:
  - CLOUDFLARED_TOKEN=eyJhbGc...your_token_here
```

### 3. Configure Tunnel Routes

In the Cloudflare dashboard:

1. Go to your tunnel settings
2. Add a **Public Hostname**:
   - **Subdomain**: `ha-mcp` (or your preferred name)
   - **Domain**: `your-domain.com`
   - **Service**: `http://ha-mcp-bridge:3003`

### 4. Update SERVER_URL

Update your `SERVER_URL` environment variable to match your tunnel:

```yaml
environment:
  - SERVER_URL=https://ha-mcp.your-domain.com
```

## Features

- **Automatic Installation**: Cloudflared is automatically downloaded and installed
- **Multi-Architecture Support**: Works on amd64, arm64, and arm architectures
- **Process Management**: Uses supervisor to manage both Node.js and cloudflared processes
- **Logging**: Separate log files for each service in `/app/logs/`
- **Health Monitoring**: Both processes are monitored and auto-restarted if they fail
- **Optional**: Only runs if `CLOUDFLARED_TOKEN` is provided

## Logs

View logs for troubleshooting:

```bash
# Container logs
docker logs ha-mcp-bridge

# Individual service logs (from inside container)
tail -f /app/logs/ha-mcp-bridge.log
tail -f /app/logs/cloudflared.log
tail -f /app/logs/supervisord.log
```

## Benefits

- **No Port Forwarding**: Access your MCP bridge from anywhere without opening ports
- **SSL/TLS**: Automatic HTTPS encryption via Cloudflare
- **DDoS Protection**: Built-in protection from Cloudflare
- **Geographic Distribution**: Faster access via Cloudflare's global network
- **Authentication**: Optional access controls via Cloudflare Access

## Troubleshooting

### Cloudflared Not Starting

1. Check if token is valid:
   ```bash
   docker exec ha-mcp-bridge /usr/local/bin/cloudflared tunnel --token YOUR_TOKEN info
   ```

2. Verify logs:
   ```bash
   docker exec ha-mcp-bridge tail -f /app/logs/cloudflared.log
   ```

### Tunnel Not Accessible

1. Verify tunnel is running in Cloudflare dashboard
2. Check DNS settings point to Cloudflare
3. Ensure tunnel routes are configured correctly
4. Test local access first: `http://localhost:3003`

## Security Notes

- Keep your tunnel token secure - treat it like a password
- Use Cloudflare Access for additional authentication if needed
- Monitor tunnel usage in the Cloudflare dashboard
- Rotate tunnel tokens periodically