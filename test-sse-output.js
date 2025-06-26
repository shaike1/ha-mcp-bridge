#!/usr/bin/env node

const https = require('https');

console.log('Testing SSE output format...\n');

const options = {
    hostname: 'ha-mcp.right-api.com',
    port: 443,
    path: '/',
    method: 'GET',
    headers: {
        'Accept': 'text/event-stream',
        'User-Agent': 'python-httpx/0.27.0'
    }
};

const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:');
    Object.entries(res.headers).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
    });
    console.log('\nSSE Events:');
    
    let eventCount = 0;
    res.on('data', (chunk) => {
        const data = chunk.toString();
        console.log('---EVENT---');
        console.log(data);
        console.log('---END---');
        
        eventCount++;
        if (eventCount >= 5) {
            req.destroy();
            console.log('\nTest completed. SSE is working correctly!');
        }
    });
    
    setTimeout(() => {
        req.destroy();
        console.log('\nTimeout reached.');
    }, 5000);
});

req.on('error', (error) => {
    console.error('Error:', error.message);
});

req.end();