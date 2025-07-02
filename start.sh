#!/bin/sh
# Start the cloudflared tunnel in the background and log output to stdout
cloudflared tunnel --url http://localhost:3001 &

# Start the node server in the foreground to keep the container running
node server.js