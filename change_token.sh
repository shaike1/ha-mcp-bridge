#!/bin/bash

# Script to update Home Assistant token in HA MCP Bridge

echo "🔧 HA MCP Bridge - Token Update Script"
echo "======================================"

# Check if server is running
SERVER_URL=${SERVER_URL:-"http://localhost:3001"}

# Method 1: Update via API (if you have your API key)
echo ""
echo "Method 1: Update via API"
echo "------------------------"
read -p "Do you have your API key? (y/n): " HAS_API_KEY

if [[ "$HAS_API_KEY" == "y" || "$HAS_API_KEY" == "Y" ]]; then
    read -s -p "Enter your API key: " API_KEY
    echo ""
    read -p "Enter your Home Assistant URL: " HA_URL
    read -s -p "Enter your new HA token: " HA_TOKEN
    echo ""
    
    echo "Updating token via API..."
    
    RESPONSE=$(curl -s -X PUT "${SERVER_URL}/api/user/update" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${API_KEY}" \
        -d "{\"haUrl\":\"${HA_URL}\",\"haToken\":\"${HA_TOKEN}\"}")
    
    if echo "$RESPONSE" | grep -q "success.*true"; then
        echo "✅ Token updated successfully!"
        
        # Test the connection
        echo "Testing connection..."
        TEST_RESPONSE=$(curl -s -X GET "${SERVER_URL}/api/user/test" \
            -H "Authorization: Bearer ${API_KEY}")
        
        if echo "$TEST_RESPONSE" | grep -q "success.*true"; then
            echo "✅ Connection test successful!"
        else
            echo "❌ Connection test failed. Please check your token."
        fi
    else
        echo "❌ Failed to update token:"
        echo "$RESPONSE"
    fi
    
    exit 0
fi

# Method 2: Update environment file
echo ""
echo "Method 2: Update Environment File"
echo "---------------------------------"

# Check for .env file
if [[ -f ".env" ]]; then
    echo "Found .env file"
    read -s -p "Enter your new Home Assistant token: " NEW_TOKEN
    echo ""
    
    # Backup current .env
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "📁 Backed up current .env file"
    
    # Update the token
    if grep -q "HOME_ASSISTANT_TOKEN" .env; then
        sed -i.bak "s/HOME_ASSISTANT_TOKEN=.*/HOME_ASSISTANT_TOKEN=${NEW_TOKEN}/" .env
        echo "✅ Updated HOME_ASSISTANT_TOKEN in .env"
    else
        echo "HOME_ASSISTANT_TOKEN=${NEW_TOKEN}" >> .env
        echo "✅ Added HOME_ASSISTANT_TOKEN to .env"
    fi
    
    echo ""
    echo "🔄 Please restart your server:"
    echo "   npm start"
    echo "   OR"
    echo "   docker-compose restart"
    
elif [[ -f ".env.production" ]]; then
    echo "Found .env.production file"
    read -s -p "Enter your new Home Assistant token: " NEW_TOKEN
    echo ""
    
    # Backup current file
    cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
    echo "📁 Backed up current .env.production file"
    
    # Update the token
    if grep -q "HOME_ASSISTANT_TOKEN" .env.production; then
        sed -i.bak "s/HOME_ASSISTANT_TOKEN=.*/HOME_ASSISTANT_TOKEN=${NEW_TOKEN}/" .env.production
        echo "✅ Updated HOME_ASSISTANT_TOKEN in .env.production"
    else
        echo "HOME_ASSISTANT_TOKEN=${NEW_TOKEN}" >> .env.production
        echo "✅ Added HOME_ASSISTANT_TOKEN to .env.production"
    fi
    
    echo ""
    echo "🔄 Please restart your server:"
    echo "   docker-compose -f docker-compose.traefik.yml --env-file .env.production restart"
    
else
    echo "❌ No .env file found"
    echo ""
    echo "Creating .env file..."
    read -p "Enter your Home Assistant URL: " HA_URL
    read -s -p "Enter your Home Assistant token: " HA_TOKEN
    echo ""
    
    cat > .env << EOF
# HA MCP Bridge Configuration
PORT=3001
SERVER_URL=http://localhost:3001

# Home Assistant Configuration  
HOME_ASSISTANT_URL=${HA_URL}
HOME_ASSISTANT_TOKEN=${HA_TOKEN}

# Multi-tenant Configuration
MULTI_TENANT=true
ENABLE_USER_REGISTRATION=true

LOG_LEVEL=info
DEBUG=false
EOF
    
    echo "✅ Created .env file with new configuration"
    echo ""
    echo "🚀 Start your server with:"
    echo "   npm start"
fi

# Method 3: Direct database update (if using file storage)
echo ""
echo "Method 3: Update User Database File"
echo "-----------------------------------"

if [[ -f "data/users.json" ]]; then
    echo "Found user database file: data/users.json"
    read -p "Do you want to update a specific user's token? (y/n): " UPDATE_USER
    
    if [[ "$UPDATE_USER" == "y" || "$UPDATE_USER" == "Y" ]]; then
        read -p "Enter the user's email: " USER_EMAIL
        read -s -p "Enter the new HA token: " NEW_TOKEN
        echo ""
        
        # Backup the file
        cp data/users.json data/users.json.backup.$(date +%Y%m%d_%H%M%S)
        echo "📁 Backed up users.json"
        
        # Update using jq if available, otherwise manual
        if command -v jq >/dev/null 2>&1; then
            # Use jq for JSON manipulation
            jq --arg email "$USER_EMAIL" --arg token "$NEW_TOKEN" '
                to_entries | 
                map(if .value.email == $email then .value.haToken = $token else . end) | 
                from_entries
            ' data/users.json > data/users.json.tmp && mv data/users.json.tmp data/users.json
            
            echo "✅ Updated token for user: $USER_EMAIL"
        else
            echo "⚠️  jq not found. Please install jq or update manually:"
            echo "   Edit data/users.json and update the haToken field for user: $USER_EMAIL"
        fi
        
        echo "🔄 Restart the server to apply changes"
    fi
else
    echo "❌ No user database file found (data/users.json)"
fi

echo ""
echo "🎯 Summary:"
echo "1. Via Dashboard: ${SERVER_URL}/dashboard"
echo "2. Via API: Use your API key with PUT /api/user/update"
echo "3. Via Environment: Update .env and restart"
echo "4. Via Database: Update data/users.json and restart"
echo ""
echo "💡 Tip: Use the dashboard method for the easiest experience!"
