@echo off
echo Starting HA MCP Proxy...
echo Connecting to: https://ha-mcp.right-api.com/mcp
echo.
echo This proxy will forward MCP requests to your Home Assistant server.
echo Press Ctrl+C to stop the proxy.
echo.

node local-mcp-proxy.js

pause 