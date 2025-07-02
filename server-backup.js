// Simple gentoken endpoint to add to server.js

// Add this before the main MCP endpoint:

  // N8N Token Generator Endpoint  
  if (parsedUrl.pathname === '/gentoken') {
    if (req.method === 'GET') {
      const html = `<!DOCTYPE html>
<html>
<head><title>N8N Token Generator</title></head>
<body>
<h1>N8N Token Generator</h1>
<form id="f">
<p>Admin User: <input id="u" value="admin"></p>
<p>Admin Pass: <input id="p" type="password"></p>
<p>HA URL: <input id="h" placeholder="https://homeassistant.local:8123"></p>
<p>HA Token: <textarea id="t" placeholder="eyJhbGci..."></textarea></p>
<button type="submit">Generate</button>
</form>
<div id="result"></div>
<script>
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const resp = await fetch('/gentoken', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      adminUser: document.getElementById('u').value,
      adminPass: document.getElementById('p').value,
      haUrl: document.getElementById('h').value,
      haToken: document.getElementById('t').value
    })
  });
  const data = await resp.json();
  document.getElementById('result').innerHTML = resp.ok ? 
    '<h3>Success!</h3><p>Cookie: ' + data.cookieHeader + '</p><p>URL: ' + data.mcpServerUrl + '</p>' :
    '<h3>Error: ' + data.error + '</h3>';
};
</script>
</body>
</html>`;
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(html);
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const {adminUser, adminPass, haUrl, haToken} = JSON.parse(body);
          
          // Validate HA connection
          const fetch = (await import('node-fetch')).default;
          const testResp = await fetch(haUrl + '/api/', {
            headers: {'Authorization': 'Bearer ' + haToken}
          });
          if (!testResp.ok) throw new Error('HA connection failed');
          
          // Create admin session
          const sessionToken = createAdminSession(haUrl, haToken);
          const tools = await getTools();
          
          const config = {
            mcpServerUrl: SERVER_URL,
            sessionToken: sessionToken,
            cookieHeader: 'admin_session=' + sessionToken,
            availableTools: tools
          };
          
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(config));
        } catch (error) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: error.message}));
        }
      });
      return;
    }
  }