#!/usr/bin/with-contenv bashio

# Get configuration options
PORT=$(bashio::config 'port')
SERVER_URL=$(bashio::config 'server_url')
ADMIN_USERNAME=$(bashio::config 'admin_username')
ADMIN_PASSWORD=$(bashio::config 'admin_password')
LOG_LEVEL=$(bashio::config 'log_level')
MULTI_TENANT=$(bashio::config 'multi_tenant')
ENABLE_USER_REGISTRATION=$(bashio::config 'enable_user_registration')

# Get Home Assistant details automatically
HA_URL="http://supervisor/core"
HA_TOKEN="${SUPERVISOR_TOKEN}"

# Set environment variables
export PORT="${PORT}"
export SERVER_URL="${SERVER_URL}"
export ADMIN_USERNAME="${ADMIN_USERNAME}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD}"
export LOG_LEVEL="${LOG_LEVEL}"
export MULTI_TENANT="${MULTI_TENANT}"
export ENABLE_USER_REGISTRATION="${ENABLE_USER_REGISTRATION}"
export HA_URL="${HA_URL}"
export HA_TOKEN="${HA_TOKEN}"
export NODE_ENV="production"

bashio::log.info "Starting Home Assistant MCP Server..."
bashio::log.info "Port: ${PORT}"
bashio::log.info "Server URL: ${SERVER_URL}"
bashio::log.info "Multi-tenant: ${MULTI_TENANT}"
bashio::log.info "User registration: ${ENABLE_USER_REGISTRATION}"

# Change to app directory
cd /app

# Start the server
exec node server.js