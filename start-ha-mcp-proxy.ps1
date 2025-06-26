Write-Host "Starting HA MCP Proxy..." -ForegroundColor Green
Write-Host "Connecting to: https://ha-mcp.right-api.com/mcp" -ForegroundColor Cyan
Write-Host ""
Write-Host "This proxy will forward MCP requests to your Home Assistant server." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the proxy." -ForegroundColor Yellow
Write-Host ""

try {
    node local-mcp-proxy.js
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Make sure Node.js is installed and local-mcp-proxy.js is in the same directory." -ForegroundColor Yellow
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 