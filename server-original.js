#!/usr/bin/env node

// Load environment variables
try {
    require('dotenv').config();
} catch (error) {
    console.log('⚠️  dotenv not found, using environment variables only');
}

const express = require('express');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const app = express();

// Configuration with fallbacks
const PORT = process.env.PORT || 3001;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const DEBUG = process.env.DEBUG === 'true';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MULTI_TENANT = process.env.MULTI_TENANT !== 'false'; // Default to true
const ENABLE_USER_REGISTRATION = process.env.ENABLE_USER_REGISTRATION !== 'false'; // Default to true
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-' + crypto.randomBytes(16).toString('hex');
const MCP_API_KEY = process.env.MCP_API_KEY || 'c5d4265e8319384af9f8e0e3ca503b07da4cf360b7a84acaafe326a249c92c21';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const OAUTH_CLIENTS_FILE = path.join(DATA_DIR, 'oauth_clients.json');

// In-memory stores for demo
const oauthCodes = new Map(); // code -> { email, client_id, expires }
const oauthTokens = new Map(); // token -> { email, exp }
const OAUTH_ISSUER = SERVER_URL;
const OAUTH_CLIENT_ID = 'dummy_client_id'; // Accept any for demo
const OAUTH_SECRET = process.env.JWT_SECRET || 'oauth-secret-key';
const OAUTH_TOKEN_EXPIRY = 60 * 60; // 1 hour

// Enhanced logging with colors
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(level, message, data = null) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = levels[LOG_LEVEL] || 2;
    
    if (levels[level] <= currentLevel) {
        const timestamp = new Date().toISOString();
        const colorMap = {
            error: colors.red,
            warn: colors.yellow,
            info: colors.blue,
            debug: colors.cyan
        };
        
        const color = colorMap[level] || colors.reset;
        const logMessage = `${color}[${timestamp}] ${level.toUpperCase()}:${colors.reset} ${message}`;
        
        if (data) {
            console.log(logMessage, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
        } else {
            console.log(logMessage);
        }
    }
}

// Initialize directories and create dashboard
async function initializeDataDir() {
    try {
        await fs.access(DATA_DIR);
        log('debug', 'Data directory exists');
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
        log('info', 'Created data directory');
    }
    
    try {
        await fs.access(PUBLIC_DIR);
        log('debug', 'Public directory exists');
    } catch {
        await fs.mkdir(PUBLIC_DIR, { recursive: true });
        log('info', 'Created public directory');
        
        // Create dashboard.html if it doesn't exist
        await createDashboard();
    }

    // Check if dashboard exists, create if not
    try {
        await fs.access(path.join(PUBLIC_DIR, 'dashboard.html'));
        log('debug', 'Dashboard exists');
    } catch {
        await createDashboard();
    }
}

// Create the dashboard HTML file
async function createDashboard() {
    const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HA MCP Bridge - Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-100 min-h-screen">
    <div x-data="dashboard()" x-init="init()" class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">HA MCP Bridge Dashboard</h1>
                    <p class="text-gray-600 mt-2">Manage your Home Assistant connections</p>
                </div>
                <div class="flex space-x-4">
                    <button @click="showLogin = !showLogin" 
                            x-show="!isLoggedIn"
                            class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
                        Login
                    </button>
                    <button @click="logout()" 
                            x-show="isLoggedIn"
                            class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg">
                        Logout
                    </button>
                </div>
            </div>
        </div>

        <!-- Welcome Message -->
        <div x-show="!isLoggedIn && !showLogin && !showRegister" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">Welcome to HA MCP Bridge</h2>
            <p class="text-gray-600 mb-4">Connect your Home Assistant to Claude via the Model Context Protocol.</p>
            <div class="space-y-4">
                <button @click="showLogin = true" 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg mr-4">
                    Login with API Key
                </button>
                <button @click="showRegister = true" 
                        class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg">
                    Register New Account
                </button>
            </div>
        </div>

        <!-- Login Form -->
        <div x-show="showLogin && !isLoggedIn" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">Login with API Key</h2>
            <div class="flex space-x-4">
                <input type="password" 
                       x-model="loginApiKey" 
                       placeholder="Enter your API key"
                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                       @keyup.enter="login()">
                <button @click="login()" 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg">
                    Login
                </button>
            </div>
            <p class="text-sm text-gray-500 mt-2">
                Don't have an API key? <a href="#" @click="showRegister = true; showLogin = false" class="text-blue-500">Register here</a>
            </p>
        </div>

        <!-- Registration Form -->
        <div x-show="showRegister && !isLoggedIn" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">Register New Account</h2>
            <div class="grid grid-cols-1 gap-4">
                <input type="email" 
                       x-model="registerForm.email" 
                       placeholder="Email address"
                       class="border border-gray-300 rounded-lg px-3 py-2">
                <input type="password"
                        x-model="registerForm.password"
                        placeholder="Password"
                        class="border border-gray-300 rounded-lg px-3 py-2">
                <input type="url" 
                       x-model="registerForm.haUrl" 
                       placeholder="Home Assistant URL (e.g., http://homeassistant.local:8123)"
                       class="border border-gray-300 rounded-lg px-3 py-2">
                <input type="password" 
                       x-model="registerForm.haToken" 
                       placeholder="Home Assistant Long-Lived Access Token"
                       class="border border-gray-300 rounded-lg px-3 py-2">
            </div>
            <div class="flex space-x-4 mt-4">
                <button @click="register()" 
                        class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg">
                    Register
                </button>
                <button @click="showRegister = false" 
                        class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg">
                    Cancel
                </button>
            </div>
            <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm text-blue-800"><strong>How to get a Home Assistant token:</strong></p>
                <ol class="text-sm text-blue-700 mt-2 list-decimal list-inside">
                    <li>Open Home Assistant</li>
                    <li>Go to Profile → Security → Long-Lived Access Tokens</li>
                    <li>Click "Create Token"</li>
                    <li>Copy the generated token</li>
                </ol>
            </div>
        </div>

        <!-- User Info -->
        <div x-show="isLoggedIn && userInfo" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">Account Information</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Email</label>
                    <p class="mt-1 text-sm text-gray-900" x-text="userInfo.email"></p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Created</label>
                    <p class="mt-1 text-sm text-gray-900" x-text="formatDate(userInfo.createdAt)"></p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Last Used</label>
                    <p class="mt-1 text-sm text-gray-900" x-text="formatDate(userInfo.lastUsed)"></p>
                </div>
            </div>
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700">Request Count</label>
                <p class="mt-1 text-sm text-gray-900" x-text="userInfo.requestCount || 0"></p>
            </div>
        </div>

        <!-- API Key Management -->
        <div x-show="isLoggedIn" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">API Key</h2>
                <button @click="regenerateApiKey()" 
                        class="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm">
                    Regenerate Key
                </button>
            </div>
            <div class="flex items-center space-x-4">
                <input :type="showApiKey ? 'text' : 'password'" 
                       :value="currentApiKey" 
                       readonly
                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-gray-50">
                <button @click="copyApiKey()" 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
                    Copy
                </button>
                <button @click="showApiKey = !showApiKey" 
                        class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
                    <span x-text="showApiKey ? 'Hide' : 'Show'"></span>
                </button>
            </div>
            <p class="text-sm text-gray-500 mt-2">
                ⚠️ Keep this key secure! It provides access to your Home Assistant.
            </p>
        </div>

        <!-- Home Assistant Configuration -->
        <div x-show="isLoggedIn" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">Home Assistant Configuration</h2>
                <div class="space-x-2">
                    <button @click="testConnection()" 
                            class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm">
                        Test Connection
                    </button>
                    <button @click="editMode = !editMode" 
                            class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                        <span x-text="editMode ? 'Cancel' : 'Edit'"></span>
                    </button>
                </div>
            </div>
            
            <div x-show="!editMode" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Home Assistant URL</label>
                    <p class="mt-1 text-sm text-gray-900" x-text="userInfo?.haUrl"></p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Access Token</label>
                    <p class="mt-1 text-sm text-gray-900">••••••••••••••••</p>
                </div>
            </div>

            <div x-show="editMode" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Home Assistant URL</label>
                    <input type="url" 
                           x-model="editForm.haUrl" 
                           class="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Access Token</label>
                    <input type="password" 
                           x-model="editForm.haToken" 
                           placeholder="Enter new token or leave blank to keep current"
                           class="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2">
                </div>
                <div class="flex space-x-4">
                    <button @click="updateConfiguration()" 
                            class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>

        <!-- Claude Desktop Configuration -->
        <div x-show="isLoggedIn" class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">Claude Desktop Configuration</h2>
            <p class="text-sm text-gray-600 mb-4">
                Copy this configuration to your Claude Desktop settings:
            </p>
            <div class="bg-gray-100 rounded-lg p-4 relative">
                <pre class="text-sm overflow-x-auto"><code x-text="claudeConfig"></code></pre>
                <button @click="copyClaudeConfig()" 
                        class="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                    Copy
                </button>
            </div>
            <div class="mt-4 p-4 bg-green-50 rounded-lg">
                <p class="text-sm text-green-800"><strong>Setup Instructions:</strong></p>
                <ol class="text-sm text-green-700 mt-2 list-decimal list-inside">
                    <li>Copy the configuration above</li>
                    <li>Open Claude Desktop settings</li>
                    <li>Paste the configuration in the MCP servers section</li>
                    <li>Restart Claude Desktop</li>
                    <li>You can now ask Claude to control your Home Assistant!</li>
                </ol>
            </div>
        </div>

        <!-- Usage Statistics -->
        <div x-show="isLoggedIn" class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold mb-4">Usage Statistics</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-500" x-text="userInfo?.requestCount || 0"></div>
                    <div class="text-sm text-gray-600">Total Requests</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-500">99.9%</div>
                    <div class="text-sm text-gray-600">Uptime</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-purple-500">< 100ms</div>
                    <div class="text-sm text-gray-600">Avg Response</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-orange-500">Free</div>
                    <div class="text-sm text-gray-600">Current Plan</div>
                </div>
            </div>
        </div>

        <!-- Alerts -->
        <div x-show="alert.show" 
             class="fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm"
             :class="alert.type === 'success' ? 'bg-green-500' : 'bg-red-500'"
             x-transition>
            <div class="flex items-center">
                <span class="text-white flex-1" x-text="alert.message"></span>
                <button @click="alert.show = false" class="ml-4 text-white hover:text-gray-200">
                    ✕
                </button>
            </div>
        </div>
    </div>

    <script>
        function dashboard() {
            return {
                isLoggedIn: false,
                showLogin: false,
                showRegister: false,
                showApiKey: false,
                editMode: false,
                currentApiKey: '',
                loginApiKey: '',
                userInfo: null,
                alert: { show: false, message: '', type: 'success' },
                registerForm: {
                    email: '',
                    password: '',
                    haUrl: 'http://homeassistant.local:8123',
                    haToken: ''
                },
                editForm: {
                    haUrl: '',
                    haToken: ''
                },

                async init() {
                    // Check if user is already logged in
                    const apiKey = localStorage.getItem('ha_mcp_api_key');
                    if (apiKey) {
                        this.currentApiKey = apiKey;
                        await this.loadUserInfo();
                    }
                },

                async login() {
                    if (!this.loginApiKey) {
                        this.showAlert('Please enter your API key', 'error');
                        return;
                    }

                    try {
                        const response = await fetch('/api/user/info', {
                            headers: {
                                'Authorization': \`Bearer \${this.loginApiKey}\`
                            }
                        });

                        if (response.ok) {
                            this.currentApiKey = this.loginApiKey;
                            localStorage.setItem('ha_mcp_api_key', this.loginApiKey);
                            this.isLoggedIn = true;
                            this.showLogin = false;
                            await this.loadUserInfo();
                            this.showAlert('Login successful!', 'success');
                        } else {
                            this.showAlert('Invalid API key', 'error');
                        }
                    } catch (error) {
                        this.showAlert('Login failed', 'error');
                    }
                },

                logout() {
                    localStorage.removeItem('ha_mcp_api_key');
                    this.isLoggedIn = false;
                    this.userInfo = null;
                    this.currentApiKey = '';
                    this.showLogin = false;
                    this.showRegister = false;
                    this.showAlert('Logged out successfully', 'success');
                },

                async register() {
                    if (!this.registerForm.email || !this.registerForm.password || !this.registerForm.haUrl || !this.registerForm.haToken) {
                        this.showAlert('Please fill in all fields', 'error');
                        return;
                    }

                    try {
                        const response = await fetch('/register', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(this.registerForm)
                        });

                        const result = await response.json();

                        if (response.ok) {
                            this.currentApiKey = result.apiKey;
                            localStorage.setItem('ha_mcp_api_key', result.apiKey);
                            this.isLoggedIn = true;
                            this.showRegister = false;
                            await this.loadUserInfo();
                            this.showAlert('Registration successful! Your API key has been saved.', 'success');
                        } else {
                            this.showAlert(result.error || 'Registration failed', 'error');
                        }
                    } catch (error) {
                        this.showAlert('Registration failed', 'error');
                    }
                },

                async loadUserInfo() {
                    try {
                        const response = await fetch('/api/user/info', {
                            headers: {
                                'Authorization': \`Bearer \${this.currentApiKey}\`
                            }
                        });

                        if (response.ok) {
                            this.userInfo = await response.json();
                            this.isLoggedIn = true;
                            this.editForm.haUrl = this.userInfo.haUrl;
                        } else {
                            // Invalid API key, clear storage
                            localStorage.removeItem('ha_mcp_api_key');
                            this.currentApiKey = '';
                            this.isLoggedIn = false;
                        }
                    } catch (error) {
                        console.error('Failed to load user info:', error);
                    }
                },

                async updateConfiguration() {
                    try {
                        const updateData = {
                            haUrl: this.editForm.haUrl
                        };

                        if (this.editForm.haToken) {
                            updateData.haToken = this.editForm.haToken;
                        }

                        const response = await fetch('/api/user/update', {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${this.currentApiKey}\`
                            },
                            body: JSON.stringify(updateData)
                        });

                        if (response.ok) {
                            await this.loadUserInfo();
                            this.editMode = false;
                            this.editForm.haToken = '';
                            this.showAlert('Configuration updated successfully', 'success');
                        } else {
                            const error = await response.json();
                            this.showAlert(error.error || 'Update failed', 'error');
                        }
                    } catch (error) {
                        this.showAlert('Update failed', 'error');
                    }
                },

                async testConnection() {
                    try {
                        const response = await fetch('/api/user/test', {
                            headers: {
                                'Authorization': \`Bearer \${this.currentApiKey}\`
                            }
                        });

                        const result = await response.json();
                        if (response.ok) {
                            this.showAlert(\`Connection successful! HA Version: \${result.haVersion || 'Unknown'}\`, 'success');
                        } else {
                            this.showAlert(result.error || 'Connection test failed', 'error');
                        }
                    } catch (error) {
                        this.showAlert('Connection test failed', 'error');
                    }
                },

                async regenerateApiKey() {
                    if (!confirm('Are you sure? This will invalidate your current API key and you\\'ll need to update Claude Desktop.')) {
                        return;
                    }

                    try {
                        const response = await fetch('/api/user/regenerate-key', {
                            method: 'POST',
                            headers: {
                                'Authorization': \`Bearer \${this.currentApiKey}\`
                            }
                        });

                        if (response.ok) {
                            const result = await response.json();
                            this.currentApiKey = result.apiKey;
                            localStorage.setItem('ha_mcp_api_key', result.apiKey);
                            this.showAlert('API key regenerated successfully', 'success');
                        } else {
                            this.showAlert('Failed to regenerate API key', 'error');
                        }
                    } catch (error) {
                        this.showAlert('Failed to regenerate API key', 'error');
                    }
                },

                copyApiKey() {
                    navigator.clipboard.writeText(this.currentApiKey).then(() => {
                        this.showAlert('API key copied to clipboard', 'success');
                    }).catch(() => {
                        this.showAlert('Failed to copy API key', 'error');
                    });
                },

                copyClaudeConfig() {
                    navigator.clipboard.writeText(this.claudeConfig).then(() => {
                        this.showAlert('Configuration copied to clipboard', 'success');
                    }).catch(() => {
                        this.showAlert('Failed to copy configuration', 'error');
                    });
                },

                get claudeConfig() {
                    return JSON.stringify({
                        mcpServers: {
                            homeassistant: {
                                command: "npx",
                                args: ["mcp-remote", window.location.origin],
                                env: {
                                    MCP_API_KEY: this.currentApiKey
                                }
                            }
                        }
                    }, null, 2);
                },

                formatDate(dateString) {
                    if (!dateString) return 'Never';
                    return new Date(dateString).toLocaleDateString();
                },

                showAlert(message, type = 'success') {
                    this.alert = { show: true, message, type };
                    setTimeout(() => {
                        this.alert.show = false;
                    }, 5000);
                }
            }
        }
    </script>
</body>
</html>`;

    await fs.writeFile(path.join(PUBLIC_DIR, 'dashboard.html'), dashboardHtml);
    log('info', 'Created dashboard.html');
}

// User management class (enhanced)
class UserManager {
    constructor() {
        this.users = new Map();
        this.loadUsers();
    }

    async loadUsers() {
        try {
            const data = await fs.readFile(USERS_FILE, 'utf8');
            const users = JSON.parse(data);
            this.users = new Map(Object.entries(users));
            log('info', `Loaded ${this.users.size} users`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log('error', 'Failed to load users', error.message);
            } else {
                log('info', 'No existing users file, starting fresh');
            }
            this.users = new Map();
        }
    }

    async saveUsers() {
        try {
            const users = Object.fromEntries(this.users);
            await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
            log('debug', 'Users saved to file');
        } catch (error) {
            log('error', 'Failed to save users', error.message);
        }
    }

    generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    async createUser(email, haUrl, haToken, hashedPassword) {
        const apiKey = this.generateApiKey();
        const user = {
            id: crypto.randomUUID(),
            email,
            apiKey,
            haUrl,
            haToken,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            requestCount: 0,
            monthlyRequests: 0
        };
        this.users.set(apiKey, user);
        await this.saveUsers();
        log('info', 'User created', { 
            email, 
            haUrl: haUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials in logs
            apiKey: apiKey.substring(0, 8) + '...'
        });
        return user;
    }

    getUser(apiKey) {
        return this.users.get(apiKey);
    }

    async updateLastUsed(apiKey) {
        const user = this.users.get(apiKey);
        if (user) {
            user.lastUsed = new Date().toISOString();
            user.requestCount = (user.requestCount || 0) + 1;
            user.monthlyRequests = (user.monthlyRequests || 0) + 1;
            // Don't save on every request for performance - save periodically or on shutdown
        }
    }

    async updateUser(apiKey, updates) {
        const user = this.users.get(apiKey);
        if (user) {
            Object.assign(user, updates);
            user.updatedAt = new Date().toISOString();
            await this.saveUsers();
            return user;
        }
        return null;
    }

    getAllUsers() {
        return Array.from(this.users.values()).map(user => ({
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            lastUsed: user.lastUsed,
            requestCount: user.requestCount || 0,
            haUrl: user.haUrl
        }));
    }

    async deleteUser(apiKey) {
        const deleted = this.users.delete(apiKey);
        if (deleted) {
            await this.saveUsers();
            log('info', 'User deleted', { apiKey: apiKey.substring(0, 8) + '...' });
        }
        return deleted;
    }
}

// Initialize user manager
const userManager = new UserManager();

// Startup logging
log('info', '🚀 Starting HA MCP Bridge (Multi-tenant)');
log('info', `🌐 SERVER_URL: ${SERVER_URL}`);
log('info', `🔐 Multi-tenant: ${MULTI_TENANT}`);
log('info', `📝 User registration: ${ENABLE_USER_REGISTRATION}`);
log('info', `🔑 Admin key: ${ADMIN_API_KEY ? ADMIN_API_KEY.substring(0, 8) + '...' : 'not set'}`);

// Express middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use(express.text({ type: 'application/jsonrpc' }));
app.use(express.static(PUBLIC_DIR));

// Enhanced CORS with better error handling - MATCH N8N exactly
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept, X-Requested-With, X-API-Key, HA-URL, HA-Token');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        log('debug', 'CORS preflight handled');
        res.status(200).end();
        return;
    }
    next();
});

// Enhanced request logging for debugging Claude.ai
app.use((req, res, next) => {
    if (req.path !== '/health') { // Don't log health checks
        log('info', `🔍 ${req.method} ${req.path}`, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']?.substring(0, 100),
            contentType: req.headers['content-type'],
            accept: req.headers['accept'],
            authorization: req.headers['authorization'] ? 'Bearer ***' : 'none',
            xApiKey: req.headers['x-api-key'] ? '***' : 'none'
        });
        
        // Log Claude.ai specific requests with more detail
        if (req.headers['user-agent']?.includes('Claude') || req.headers['user-agent']?.includes('claude')) {
            log('info', '🤖 CLAUDE.AI REQUEST DETECTED', {
                fullUserAgent: req.headers['user-agent'],
                allHeaders: Object.keys(req.headers),
                method: req.method,
                path: req.path
            });
        }
    }
    next();
});

// Authentication middleware
function authenticate(req, res, next) {
    // --- New URL-based authentication ---
    const urlApiKey = req.query.api_key;
    const urlHaUrl = req.query.ha_url;
    const urlHaToken = req.query.ha_token;

    if (urlApiKey && urlHaUrl && urlHaToken) {
        log('debug', 'Attempting authentication via URL parameters.');
        if (urlApiKey === ADMIN_API_KEY) {
            req.isAdmin = true;
            req.haConfig = {
                url: urlHaUrl,
                token: urlHaToken
            };
            log('debug', 'Admin authentication via URL successful');
            return next();
        }
        
        const user = userManager.getUser(urlApiKey);
        if (user) {
            req.user = user;
            req.haConfig = { url: urlHaUrl, token: urlHaToken };
            userManager.updateLastUsed(urlApiKey);
            log('debug', 'User authentication via URL successful', { email: user.email });
            return next();
        }
    }
    // --- End of new logic ---

    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const token = authHeader?.replace('Bearer ', '');
    const userApiKey = token || apiKey;

    // Admin authentication
    if (userApiKey === ADMIN_API_KEY) {
        req.isAdmin = true;
        req.haConfig = {
            url: process.env.HA_URL,
            token: process.env.HA_TOKEN
        };
        log('debug', 'Admin authentication successful');
        return next();
    }

    // Multi-tenant mode
    if (MULTI_TENANT && userApiKey) {
        const user = userManager.getUser(userApiKey);
        if (user) {
            req.user = user;
            req.haConfig = {
                url: user.haUrl,
                token: user.haToken
            };
            userManager.updateLastUsed(userApiKey);
            log('debug', 'User authentication successful', { email: user.email });
            return next();
        }
    }

    // Fallback authentication
    const headerHaUrl = req.headers['ha-url'];
    const headerHaToken = req.headers['ha-token'];
    
    if (headerHaUrl && headerHaToken) {
        req.haConfig = {
            url: headerHaUrl,
            token: headerHaToken
        };
        log('debug', 'Header-based HA config authentication');
        return next();
    }

    // Liberal authentication for MCP clients
    if (req.headers['user-agent']?.includes('Claude') || 
        req.headers['user-agent']?.includes('mcp-remote') ||
        req.headers['user-agent']?.includes('python-httpx') ||
        req.path === '/health' || 
        req.path === '/' && req.method === 'GET') {
        log('debug', 'Client authentication successful (liberal mode)', {
            userAgent: req.headers['user-agent']?.substring(0, 50),
            path: req.path,
            method: req.method
        });
        
        // Set a default HA config for liberal auth mode
        if (!req.haConfig && process.env.HA_URL && process.env.HA_TOKEN) {
            req.haConfig = {
                url: process.env.HA_URL,
                token: process.env.HA_TOKEN
            };
            log('debug', 'Using default HA config for liberal auth');
        }
        
        return next();
    }

    log('warn', 'Authentication failed', {
        hasAuthHeader: !!authHeader,
        hasApiKey: !!apiKey,
        userAgent: req.headers['user-agent']?.substring(0, 30),
        path: req.path
    });
    
    return res.status(401).json({ 
        error: 'Unauthorized. Please provide a valid API key.',
        endpoints: {
            register: ENABLE_USER_REGISTRATION ? '/register' : 'disabled',
            health: '/health',
            dashboard: '/dashboard'
        }
    });
}

// Home Assistant API functions with better error handling
async function callHomeAssistant(endpoint, method = 'GET', data = null, config = null) {
    if (!config?.url || !config?.token) {
        throw new Error('Home Assistant configuration required. Please provide HA URL and token.');
    }

    const url = `${config.url}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        }
    };

    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    log('debug', `HA API call: ${method} ${endpoint}`);
    
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HA API error: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
        }

        return await response.json();
    } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error('Cannot connect to Home Assistant. Please check the URL and ensure HA is running.');
        }
        log('error', 'HA API call failed', error.message);
        throw error;
    }
}

// Routes

// Landing page with better info - moved to /info to avoid conflict with MCP endpoint
app.get('/info', (req, res) => {
    const isAdmin = req.headers.authorization === `Bearer ${ADMIN_API_KEY}`;
    
    res.json({
        name: 'HA MCP Bridge',
        version: '2.0.0',
        description: 'Multi-tenant Home Assistant MCP Bridge for Claude',
        status: 'running',
        features: {
            multiTenant: MULTI_TENANT,
            userRegistration: ENABLE_USER_REGISTRATION,
            userDashboard: true,
            adminInterface: isAdmin
        },
        endpoints: {
            health: '/health',
            dashboard: '/dashboard',
            register: ENABLE_USER_REGISTRATION ? '/register' : 'disabled',
            mcp: 'GET/POST /',
            admin: isAdmin ? '/admin/users' : 'admin access required'
        },
        statistics: {
            totalUsers: userManager.users.size,
            registrationEnabled: ENABLE_USER_REGISTRATION
        },
        serverInfo: {
            serverUrl: SERVER_URL,
            nodeVersion: process.version,
            uptime: process.uptime()
        },
        documentation: {
            github: 'https://github.com/yourusername/ha-mcp-bridge',
            userGuide: `${SERVER_URL}/dashboard`
        }
    });
});

// Health check with more details
app.get('/health', (req, res) => {
    const users = Array.from(userManager.users.values());
    const health = {
        status: 'ok',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        server: {
            url: SERVER_URL,
            multiTenant: MULTI_TENANT,
            userRegistration: ENABLE_USER_REGISTRATION
        },
        statistics: {
            totalUsers: userManager.users.size,
            totalRequests: users.reduce((sum, user) => sum + (user.requestCount || 0), 0)
        },
        features: {
            userDashboard: true,
            adminInterface: !!ADMIN_API_KEY,
            healthChecks: true
        },
        tools: ['get_entities', 'call_service', 'get_automations', 'get_lights', 'get_switches']
    };

    res.json(health);
});

// User registration
app.post('/register', async (req, res) => {
    if (!ENABLE_USER_REGISTRATION) {
        return res.status(403).json({ 
            error: 'User registration is currently disabled',
            contact: 'Please contact the administrator for access'
        });
    }

    const { email, haUrl, haToken, password } = req.body;

    if (!email || !haUrl || !haToken || !password) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            required: ['email', 'haUrl', 'haToken', 'password'],
            example: {
                email: 'user@example.com',
                haUrl: 'http://homeassistant.local:8123',
                haToken: 'your_long_lived_access_token',
                password: 'your_password'
            }
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate URL format
    try {
        new URL(haUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid Home Assistant URL format' });
    }

    try {
        // Test HA connection
        log('info', 'Testing HA connection for registration', { email, haUrl: haUrl.replace(/\/\/.*@/, '//***@') });
        await callHomeAssistant('/api/', 'GET', null, { url: haUrl, token: haToken });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await userManager.createUser(email, haUrl, haToken, hashedPassword);

        res.json({
            success: true,
            apiKey: user.apiKey,
            message: 'Registration successful! Save your API key securely - you won\'t see it again.',
            nextSteps: {
                dashboard: `${SERVER_URL}/dashboard`,
                claudeConfig: `${SERVER_URL}/dashboard - copy the generated configuration`
            }
        });
    } catch (error) {
        log('error', 'Registration failed', { email, error: error.message });
        res.status(400).json({ 
            error: 'Failed to connect to Home Assistant',
            details: error.message,
            troubleshooting: [
                'Verify your Home Assistant URL is correct and accessible',
                'Ensure your long-lived access token is valid',
                'Check that Home Assistant is running and reachable'
            ]
        });
    }
});

// Serve dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// User info endpoint
app.get('/api/user/info', authenticate, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const userInfo = {
        id: req.user.id,
        email: req.user.email,
        haUrl: req.user.haUrl,
        createdAt: req.user.createdAt,
        lastUsed: req.user.lastUsed,
        requestCount: req.user.requestCount
    };

    res.json(userInfo);
});

// Update user configuration
app.put('/api/user/update', authenticate, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    const { haUrl, haToken } = req.body;

    if (!haUrl) {
        return res.status(400).json({ error: 'Home Assistant URL is required' });
    }

    try {
        // Test connection
        const testConfig = { url: haUrl, token: haToken || req.user.haToken };
        await callHomeAssistant('/api/', 'GET', null, testConfig);

        // Update user
        const apiKey = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'];
        const updates = { haUrl };
        if (haToken) updates.haToken = haToken;
        
        await userManager.updateUser(apiKey, updates);
        
        log('info', 'User configuration updated', { 
            userId: req.user.id, 
            email: req.user.email
        });

        res.json({ success: true, message: 'Configuration updated successfully' });

    } catch (error) {
        log('error', 'Configuration update failed', error.message);
        res.status(400).json({ 
            error: 'Failed to connect to Home Assistant. Please check your URL and token.' 
        });
    }
});

// Test HA connection
app.get('/api/user/test', authenticate, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    try {
        const haInfo = await callHomeAssistant('/api/', 'GET', null, req.haConfig);
        
        res.json({ 
            success: true, 
            message: 'Connection successful',
            haVersion: haInfo.version,
            haMessage: haInfo.message
        });
    } catch (error) {
        log('error', 'HA connection test failed', error.message);
        res.status(400).json({ 
            error: 'Connection test failed: ' + error.message 
        });
    }
});

// Regenerate API key
app.post('/api/user/regenerate-key', authenticate, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User authentication required' });
    }

    try {
        const oldApiKey = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'];
        const newApiKey = userManager.generateApiKey();
        
        const user = userManager.getUser(oldApiKey);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update with new key
        userManager.users.delete(oldApiKey);
        user.apiKey = newApiKey;
        user.keyRegeneratedAt = new Date().toISOString();
        userManager.users.set(newApiKey, user);
        
        await userManager.saveUsers();

        log('info', 'API key regenerated', { 
            userId: user.id, 
            email: user.email
        });

        res.json({ 
            success: true, 
            apiKey: newApiKey,
            message: 'API key regenerated successfully'
        });

    } catch (error) {
        log('error', 'API key regeneration failed', error.message);
        res.status(500).json({ error: 'Failed to regenerate API key' });
    }
});

// JSON-RPC message handler with better error handling
async function handleJsonRpcMessage(body, haConfig = null, user = null) {
    const { method, params, id } = body;
    
    log('debug', `Handling JSON-RPC method: ${method}`, user ? { userId: user.id } : null);
    
    let result;

    switch (method) {
        case 'initialize':
            result = {
                protocolVersion: "2024-11-05",
                capabilities: { 
                    tools: {
                        listChanged: true
                    },
                    prompts: {}
                },
                serverInfo: {
                    name: "HA MCP Bridge (Multi-tenant)",
                    version: "2.0.0"
                }
            };
            log('info', 'MCP client initialized', user ? { email: user.email } : { mode: 'anonymous' });
            break;

        case 'prompts/list':
            // HACK: Since Claude.ai only requests prompts/list and never tools/list,
            // we'll send the tools response when it asks for prompts
            log('info', '🔧 HACK: Claude.ai requested prompts/list, sending tools instead!', {
                userId: user?.id,
                userEmail: user?.email,
                hasHaConfig: !!haConfig
            });
            result = {
                tools: [
                    {
                        name: 'get_entities',
                        description: 'Get all Home Assistant entities or filter by domain',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
                            }
                        }
                    },
                    {
                        name: 'call_service',
                        description: 'Call a Home Assistant service to control devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Service domain' },
                                service: { type: 'string', description: 'Service name' },
                                entity_id: { type: 'string', description: 'Target entity ID' },
                                data: { type: 'object', description: 'Additional service data' }
                            },
                            required: ['domain', 'service']
                        }
                    },
                    {
                        name: 'get_automations',
                        description: 'Get all Home Assistant automations',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_lights',
                        description: 'Get all light entities',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_switches',
                        description: 'Get all switch entities',
                        inputSchema: { type: 'object', properties: {} }
                    }
                ]
            };
            break;

        case 'resources/list':
            // ULTIMATE HACK: Claude.ai sometimes requests resources/list
            // Send tools response here too to ensure discovery
            log('info', '🔧 ULTIMATE HACK: Sending tools for resources/list request', {
                userId: user?.id,
                userEmail: user?.email,
                hasHaConfig: !!haConfig
            });
            result = {
                tools: [
                    {
                        name: 'get_entities',
                        description: 'Get all Home Assistant entities or filter by domain',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
                            }
                        }
                    },
                    {
                        name: 'call_service',
                        description: 'Call a Home Assistant service to control devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Service domain' },
                                service: { type: 'string', description: 'Service name' },
                                entity_id: { type: 'string', description: 'Target entity ID' },
                                data: { type: 'object', description: 'Additional service data' }
                            },
                            required: ['domain', 'service']
                        }
                    },
                    {
                        name: 'get_automations',
                        description: 'Get all Home Assistant automations',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_lights',
                        description: 'Get all light entities',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_switches',
                        description: 'Get all switch entities',
                        inputSchema: { type: 'object', properties: {} }
                    }
                ]
            };
            break;

        case 'tools/call':
            if (!haConfig) {
                throw new Error('Home Assistant configuration required for tool calls. Please register at /register or provide HA-URL and HA-Token headers.');
            }

            const { name, arguments: args } = params;
            log('info', `Tool called: ${name}`, { args, userId: user?.id });

            try {
                let toolResult;
                const entities = await callHomeAssistant('/api/states', 'GET', null, haConfig);

                switch (name) {
                    case 'get_entities':
                        toolResult = args?.domain ? 
                            entities.filter(e => e.entity_id.startsWith(args.domain + '.')) : 
                            entities;
                        break;
                    case 'call_service':
                        const serviceData = { ...args.data };
                        if (args.entity_id) serviceData.entity_id = args.entity_id;
                        toolResult = await callHomeAssistant(`/api/services/${args.domain}/${args.service}`, 'POST', serviceData, haConfig);
                        break;
                    case 'get_automations':
                        toolResult = entities.filter(e => e.entity_id.startsWith('automation.'));
                        break;
                    case 'get_lights':
                        toolResult = entities.filter(e => e.entity_id.startsWith('light.'));
                        break;
                    case 'get_switches':
                        toolResult = entities.filter(e => e.entity_id.startsWith('switch.'));
                        break;
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }

                result = {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(toolResult, null, 2)
                        }
                    ]
                };

            } catch (error) {
                log('error', 'Tool execution error', { tool: name, error: error.message, userId: user?.id });
                result = {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing ${name}: ${error.message}`
                        }
                    ]
                };
            }
            break;

        case 'notifications/initialized':
            log('info', 'Client initialized notification received');
            return {};

        case 'tools/list':
            log('info', '✅ NORMAL: tools/list requested (standard MCP protocol)', {
                userId: user?.id,
                userEmail: user?.email,
                hasHaConfig: !!haConfig
            });
            result = {
                tools: [
                    {
                        name: 'get_entities',
                        description: 'Get all Home Assistant entities or filter by domain',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
                            }
                        }
                    },
                    {
                        name: 'call_service',
                        description: 'Call a Home Assistant service to control devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Service domain' },
                                service: { type: 'string', description: 'Service name' },
                                entity_id: { type: 'string', description: 'Target entity ID' },
                                data: { type: 'object', description: 'Additional service data' }
                            },
                            required: ['domain', 'service']
                        }
                    },
                    {
                        name: 'get_automations',
                        description: 'Get all Home Assistant automations',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_lights',
                        description: 'Get all light entities',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'get_switches',
                        description: 'Get all switch entities',
                        inputSchema: { type: 'object', properties: {} }
                    }
                ]
            };
            break;

        default:
            throw new Error(`Unknown JSON-RPC method: ${method}`);
    }

    return { jsonrpc: "2.0", id, result };
}

// Helper function for SSE writes
function sseWrite(res, event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
}


// Test SSE endpoint without middleware
app.get('/test-sse', (req, res) => {
    log('info', 'TEST SSE: Direct SSE test without middleware');
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache', 
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    res.write('data: {"type":"test","message":"SSE working"}\\n\\n');
    
    const keepAlive = setInterval(() => {
        res.write('data: {"type":"ping"}\\n\\n');
    }, 5000);
    
    req.on('close', () => {
        clearInterval(keepAlive);
        log('info', 'TEST SSE: Connection closed');
    });
    
    log('info', 'TEST SSE: Connection established');
});

// Test MCP endpoint without auth middleware
app.get('/test-mcp', (req, res) => {
    // Set dummy config for testing
    req.haConfig = { url: 'https://ha.right-api.com', token: 'test' };
    req.user = { email: 'test@test.com' };
    handleMCPRequest(req, res);
});

// Add both GET and POST routes for MCP endpoint - EXACTLY like N8N  
// Proper MCP endpoints using JSON-RPC handler (no duplicate handlers)
app.get('/', authenticateOAuth, (req, res) => {
    const acceptHeader = req.headers.accept || '';
    const supportsSSE = acceptHeader.includes('text/event-stream');
    
    if (supportsSSE) {
        // SSE connection for real-time tool updates
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept'
        });
        
        res.write('data: {"type":"connection","status":"established"}\n\n');
        
        // Send tools via SSE
        setTimeout(async () => {
            try {
                const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: {}, id: 'sse-auto' }, req.haConfig, req.user);
                const toolsMessage = {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 'sse-auto-' + Date.now(),
                    result: toolsResponse.result
                };
                res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
            } catch (err) {
                console.error('SSE tools error:', err);
            }
        }, 500);
        
        const keepAlive = setInterval(() => res.write('data: {"type":"ping"}\n\n'), 30000);
        req.on('close', () => clearInterval(keepAlive));
    } else {
        // Regular GET - return server info
        res.json({
            name: 'HA MCP Server',
            version: '2.0.0',
            transport: 'http',
            capabilities: { tools: true, prompts: false }
        });
    }
});

app.post('/', authenticateOAuth, async (req, res) => {
    try {
        const response = await handleJsonRpcMessage(req.body, req.haConfig, req.user);
        
        // Apply Claude.ai discovery hacks
        if (req.body.method === 'prompts/list') {
            const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: req.body.params, id: req.body.id }, req.haConfig, req.user);
            response.result = toolsResponse.result; // Send tools instead of prompts
        }
        
        // Check if Claude.ai wants SSE after initialize
        const acceptHeader = req.headers.accept || '';
        const supportsSSE = acceptHeader.includes('text/event-stream');
        
        // Normal JSON response (no tools in initialize per MCP spec)
        res.json(response);
    } catch (error) {
        res.status(500).json({
            jsonrpc: '2.0',
            id: req.body.id || null,
            error: { code: -32603, message: 'Internal error', data: error.message }
        });
    }
});

// Simple API key authentication for desktop clients
function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
        return res.status(401).json({ 
            error: "API key required. Please provide X-API-Key header or Authorization: Bearer <key>",
            endpoints: {
                register: "/register",
                health: "/health"
            }
        });
    }

    let user;
    // Check for admin key first
    if (apiKey === ADMIN_API_KEY) {
        log('debug', 'Admin key used for API authentication');
        user = {
            id: 'admin',
            email: 'admin@localhost',
            haUrl: process.env.HA_URL,
            haToken: process.env.HA_TOKEN,
            apiKey: ADMIN_API_KEY
        };
    } else {
        // Look up regular user
        user = userManager.getUser(apiKey);
    }

    if (!user) {
        log('warn', 'Invalid API key provided', { apiKey: apiKey.substring(0, 8) + '...' });
        return res.status(401).json({ 
            error: "Invalid API key. Please check your key and try again.",
            endpoints: {
                register: "/register",
                health: "/health"
            }
        });
    }

    req.user = user;
    req.haConfig = {
        baseURL: user.haUrl,
        headers: {
            'Authorization': `Bearer ${user.haToken}`,
            'Content-Type': 'application/json'
        }
    };

    log('info', 'API key authentication successful', { email: user.email });
    next();
}

// Simple MCP endpoint for testing
app.post('/mcp-simple', authenticate, async (req, res) => {
    try {
        log('info', '🔧 Simple MCP endpoint called', { 
            method: req.body?.method, 
            userAgent: req.headers['user-agent']?.substring(0, 50)
        });
        
        // Force tools response for any method if this is Claude.ai
        if (req.headers['user-agent']?.includes('python-httpx')) {
            const tools = [
                {
                    name: 'get_entities',
                    description: 'Get all Home Assistant entities or filter by domain',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
                        }
                    }
                },
                {
                    name: 'call_service',
                    description: 'Call a Home Assistant service to control devices',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            domain: { type: 'string', description: 'Service domain' },
                            service: { type: 'string', description: 'Service name' },
                            entity_id: { type: 'string', description: 'Target entity ID' },
                            data: { type: 'object', description: 'Additional service data' }
                        },
                        required: ['domain', 'service']
                    }
                },
                {
                    name: 'get_automations',
                    description: 'Get all Home Assistant automations',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'get_lights',
                    description: 'Get all light entities',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'get_switches',
                    description: 'Get all switch entities',
                    inputSchema: { type: 'object', properties: {} }
                }
            ];
            
            log('info', '🔧 FORCE: Sending tools for any request from Claude.ai');
            return res.json({
                jsonrpc: "2.0",
                id: req.body?.id || 1,
                result: { tools: tools }
            });
        }
        
        const response = await handleJsonRpcMessage(req.body, req.haConfig, req.user);
        res.json(response);
    } catch (error) {
        log('error', 'Simple MCP error', error.message);
        res.status(500).json({
            jsonrpc: "2.0",
            id: req.body?.id,
            error: { code: -32603, message: error.message }
        });
    }
});

// Desktop-friendly MCP endpoint with OAuth2 and API key auth
app.post('/mcp', authenticateOAuth, async (req, res) => {
    try {
        const response = await handleJsonRpcMessage(req.body, req.haConfig, req.user);
        const responseBody = JSON.stringify(response);
        if (req.body.method === 'initialize') {
            log('debug', 'Desktop client initialized', { email: req.user?.email });
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', Buffer.byteLength(responseBody));
        res.send(responseBody);
    } catch (error) {
        log('error', 'Desktop MCP error', { error: error.message, method: req.body?.method, email: req.user?.email });
        const errorBody = JSON.stringify({
            jsonrpc: "2.0",
            id: req.body?.id,
            error: { 
                code: -32603, 
                message: error.message,
                data: {
                    timestamp: new Date().toISOString(),
                    method: req.body?.method
                }
            }
        });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', Buffer.byteLength(errorBody));
        res.status(500).send(errorBody);
    }
});

// Admin endpoints
app.get('/admin/users', authenticate, (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const users = userManager.getAllUsers();
    const stats = {
        totalUsers: users.length,
        totalRequests: users.reduce((sum, user) => sum + (user.requestCount || 0), 0),
        activeUsers: users.filter(user => user.lastUsed).length,
        newUsersToday: users.filter(user => {
            const today = new Date().toDateString();
            return new Date(user.createdAt).toDateString() === today;
        }).length
    };

    res.json({
        users,
        statistics: stats
    });
});

app.delete('/admin/users/:apiKey', authenticate, async (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const deleted = await userManager.deleteUser(req.params.apiKey);
    res.json({ 
        success: deleted,
        message: deleted ? 'User deleted successfully' : 'User not found'
    });
});

// --- OAuth 2.0 Endpoints ---

// Metadata
app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
        issuer: OAUTH_ISSUER,
        authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
        token_endpoint: `${SERVER_URL}/oauth/token`,
        registration_endpoint: `${SERVER_URL}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
        scopes_supported: ['mcp', 'homeassistant'],
        subject_types_supported: ['public'],
        client_registration_endpoint: `${SERVER_URL}/oauth/register`
    });
});

// Authorization Endpoint (Renders UI)
app.get('/oauth/authorize', (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = req.query;
    
    // Basic validation of required OAuth params
    if (!client_id || !redirect_uri || !state || !response_type) {
        return res.status(400).send('Missing required OAuth parameters.');
    }
    
    // Simple HTML form for API Key submission
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Authorize Access</title>
    <style>
        body { font-family: sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .auth-box { background: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 2em; max-width: 400px; width: 100%; text-align: center; }
        h2 { margin-top: 0; color: #111827; }
        p { color: #4b5563; }
        input[type=text], input[type=password] { width: 100%; padding: 0.75em; margin: 1em 0; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; background: #2563eb; color: #fff; border: none; padding: 0.75em; border-radius: 4px; cursor: pointer; font-size: 1em; }
        button:hover { background: #1d4ed8; }
    </style>
</head>
<body>
    <div class="auth-box">
        <h2>Authorize Access</h2>
        <p>An application is requesting access to your Home Assistant account.</p>
        <form method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="${client_id || ''}" />
            <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}" />
            <input type="hidden" name="state" value="${state || ''}" />
            <input type="hidden" name="code_challenge" value="${code_challenge || ''}" />
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method || ''}" />
            <input type="hidden" name="response_type" value="${response_type || ''}" />
            <input name="apiKey" type="password" placeholder="Enter your API Key" required />
            <button type="submit">Authorize</button>
        </form>
    </div>
</body>
</html>`);
});

// Authorization Endpoint (Handles Form Submission)
app.post('/oauth/authorize', express.urlencoded({ extended: true }), async (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type, apiKey } = req.body;
    log('debug', 'OAuth authorization attempt', { apiKeyProvided: !!apiKey });

    if (response_type !== 'code') {
        return res.status(400).send('Unsupported response_type');
    }

    let user;
    // Check for admin key first
    if (apiKey === ADMIN_API_KEY) {
        log('debug', 'Admin key used for OAuth');
        user = {
            id: 'admin',
            email: 'admin@localhost',
            haUrl: process.env.HA_URL, // Assuming admin uses env vars
            haToken: process.env.HA_TOKEN,
            apiKey: ADMIN_API_KEY
        };
    } else {
        // Look up regular user
        user = userManager.getUser(apiKey);
    }

    if (!user) {
        log('warn', 'Invalid API key provided during OAuth flow');
        return res.status(401).send('Invalid API Key. Please check your key and try again.');
    }

    log('info', 'User authorized via OAuth', { email: user.email });
    const code = crypto.randomBytes(32).toString('hex');
    oauthCodes.set(code, {
        email: user.email,
        userId: user.id,
        client_id,
        code_challenge,
        code_challenge_method,
        redirect_uri,
        expires: Date.now() + 5 * 60 * 1000 // 5 min expiry
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);
    
    res.redirect(redirectUrl.toString());
});

// Token Endpoint
app.post('/oauth/token', express.urlencoded({ extended: true }), async (req, res) => {
    const { grant_type, code, client_id, client_secret, code_verifier } = req.body;
    log('debug', 'OAuth token request received', { grant_type });

    if (grant_type === 'authorization_code') {
        const codeData = oauthCodes.get(code);
        if (!codeData || codeData.client_id !== client_id || codeData.expires < Date.now()) {
            log('warn', 'Invalid or expired auth code used', { code });
            return res.status(400).json({ error: 'invalid_grant' });
        }

        // PKCE verification
        if (codeData.code_challenge && codeData.code_challenge_method === 'S256') {
            if (!code_verifier) {
                return res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier required' });
            }
            const verifierHash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
            if (verifierHash !== codeData.code_challenge) {
                log('warn', 'PKCE verification failed', { code });
                return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
            }
        }

        const token = jwt.sign(
            { sub: codeData.userId, email: codeData.email },
            OAUTH_SECRET,
            { expiresIn: OAUTH_TOKEN_EXPIRY, issuer: OAUTH_ISSUER }
        );
        
        oauthTokens.set(token, { email: codeData.email, exp: Date.now() + OAUTH_TOKEN_EXPIRY * 1000 });
        oauthCodes.delete(code); // One-time use

        log('info', 'OAuth token issued', { email: codeData.email });
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        return res.json({
            access_token: token,
            token_type: 'Bearer',
            expires_in: OAUTH_TOKEN_EXPIRY,
            scope: "mcp homeassistant"
        });
    } else if (grant_type === 'client_credentials') {
        // Support both OAuth clients and user API keys as client_secret
        let user = null;
        let client = null;
        // 1. Try OAuth client credentials
        if (client_id && client_secret) {
            client = oauthClients.get(client_id);
            if (client && client.client_secret === client_secret) {
                // Find user by client_id (if you want to associate clients with users, add a userId/email to client object)
                // For now, just issue a token for the client
                const token = jwt.sign(
                    { sub: client_id, email: client.client_name || client_id },
                    OAUTH_SECRET,
                    { expiresIn: OAUTH_TOKEN_EXPIRY, issuer: OAUTH_ISSUER }
                );
                oauthTokens.set(token, { email: client.client_name || client_id, exp: Date.now() + OAUTH_TOKEN_EXPIRY * 1000 });
                log('info', 'OAuth client_credentials token issued', { client_id });
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('Pragma', 'no-cache');
                return res.json({
                    access_token: token,
                    token_type: 'Bearer',
                    expires_in: OAUTH_TOKEN_EXPIRY,
                    scope: "mcp homeassistant"
                });
            }
        }
        // 2. Try user API key as client_secret (for backward compatibility)
        if (client_id && client_secret === 'api_key') {
            user = userManager.getUser(client_id);
            if (user) {
                const token = jwt.sign(
                    { sub: user.id, email: user.email },
                    OAUTH_SECRET,
                    { expiresIn: OAUTH_TOKEN_EXPIRY, issuer: OAUTH_ISSUER }
                );
                oauthTokens.set(token, { email: user.email, exp: Date.now() + OAUTH_TOKEN_EXPIRY * 1000 });
                log('info', 'OAuth client_credentials token issued for user', { email: user.email });
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('Pragma', 'no-cache');
                return res.json({
                    access_token: token,
                    token_type: 'Bearer',
                    expires_in: OAUTH_TOKEN_EXPIRY,
                    scope: "mcp homeassistant"
                });
            }
        }
        // 3. Try user API key as client_id and client_secret (for simple API key auth)
        user = userManager.getUser(client_id);
        if (user && client_secret === user.apiKey) {
            const token = jwt.sign(
                { sub: user.id, email: user.email },
                OAUTH_SECRET,
                { expiresIn: OAUTH_TOKEN_EXPIRY, issuer: OAUTH_ISSUER }
            );
            oauthTokens.set(token, { email: user.email, exp: Date.now() + OAUTH_TOKEN_EXPIRY * 1000 });
            log('info', 'OAuth client_credentials token issued for user (apiKey)', { email: user.email });
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Pragma', 'no-cache');
            return res.json({
                access_token: token,
                token_type: 'Bearer',
                expires_in: OAUTH_TOKEN_EXPIRY,
                scope: "mcp homeassistant"
            });
        }
        // 4. Try global MCP_API_KEY (for admin/service use)
        if (client_id === MCP_API_KEY && client_secret === MCP_API_KEY) {
            const token = jwt.sign(
                { sub: 'admin', email: 'admin@localhost' },
                OAUTH_SECRET,
                { expiresIn: OAUTH_TOKEN_EXPIRY, issuer: OAUTH_ISSUER }
            );
            oauthTokens.set(token, { email: 'admin@localhost', exp: Date.now() + OAUTH_TOKEN_EXPIRY * 1000 });
            log('info', 'OAuth client_credentials token issued for MCP_API_KEY');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Pragma', 'no-cache');
            return res.json({
                access_token: token,
                token_type: 'Bearer',
                expires_in: OAUTH_TOKEN_EXPIRY,
                scope: "mcp homeassistant"
            });
        }
        // If none matched, error
        log('warn', 'Invalid client_credentials', { client_id });
        return res.status(400).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
    } else {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }
});

// --- OAuth 2.0 Client Registry ---
const oauthClients = new Map(); // client_id -> client object

// Load OAuth clients from disk
async function loadOAuthClients() {
    try {
        await fs.access(OAUTH_CLIENTS_FILE);
        const data = await fs.readFile(OAUTH_CLIENTS_FILE, 'utf8');
        const arr = JSON.parse(data);
        arr.forEach(client => oauthClients.set(client.client_id, client));
        log('info', `Loaded ${arr.length} OAuth clients from disk`);
    } catch (e) {
        log('info', 'No existing OAuth clients file found, starting fresh');
    }
}

// Save OAuth clients to disk
async function saveOAuthClients() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(OAUTH_CLIENTS_FILE, JSON.stringify(Array.from(oauthClients.values()), null, 2), 'utf8');
        log('debug', 'Saved OAuth clients to disk');
    } catch (e) {
        log('error', 'Failed to save OAuth clients', e.message);
    }
}

// --- RFC 7591 Dynamic Client Registration ---
app.post('/oauth/register', express.json(), async (req, res) => {
    const { redirect_uris, client_name, scope, grant_types, token_endpoint_auth_method, response_types, ...rest } = req.body;
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({
            error: 'invalid_client_metadata',
            error_description: 'redirect_uris (array) is required.'
        });
    }
    const clientId = `client_${crypto.randomBytes(8).toString('hex')}`;
    const clientSecret = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const client = {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: now,
        client_secret_expires_at: 0,
        redirect_uris,
        client_name: client_name || undefined,
        scope: scope || undefined,
        grant_types: grant_types || ['authorization_code'],
        response_types: response_types || ['code'],
        token_endpoint_auth_method: token_endpoint_auth_method || 'client_secret_basic',
        ...rest
    };
    oauthClients.set(clientId, client);
    await saveOAuthClients();
    log('info', 'OAuth client registered', { client_id: clientId, client_name });
    const response = Object.fromEntries(Object.entries(client).filter(([k,v]) => v !== undefined));
    res.status(201).json(response);
});

// --- Admin authentication middleware ---
function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-api-key'];
    if (!key || key !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'unauthorized', message: 'Admin API key required.' });
    }
    next();
}

// --- (Optional) List registered clients for admin/debugging ---
app.get('/oauth/clients', requireAdmin, (req, res) => {
    res.json(Array.from(oauthClients.values()));
});

// --- Get a single client by ID ---
app.get('/oauth/clients/:id', requireAdmin, (req, res) => {
    const client = oauthClients.get(req.params.id);
    if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found.' });
    res.json(client);
});

// --- Update a client by ID (PATCH) ---
app.patch('/oauth/clients/:id', requireAdmin, express.json(), async (req, res) => {
    const client = oauthClients.get(req.params.id);
    if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found.' });
    // Only allow updating certain fields
    const allowed = ['client_name', 'scope', 'redirect_uris', 'grant_types', 'response_types', 'token_endpoint_auth_method'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) client[key] = req.body[key];
    }
    oauthClients.set(req.params.id, client);
    await saveOAuthClients();
    res.json(client);
});

// --- Delete a client by ID ---
app.delete('/oauth/clients/:id', requireAdmin, async (req, res) => {
    if (!oauthClients.has(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'Client not found.' });
    oauthClients.delete(req.params.id);
    await saveOAuthClients();
    res.json({ success: true });
});

// Userinfo endpoint - standard in OIDC, useful for debugging
app.get('/userinfo', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'invalid_token' });
    const token = auth.slice(7);
    try {
        const payload = jwt.verify(token, OAUTH_SECRET, { issuer: OAUTH_ISSUER });
        res.json({ sub: payload.sub, email: payload.email });
    } catch {
        res.status(401).json({ error: 'invalid_token' });
    }
});

// Accept Bearer tokens for API calls
function authenticateOAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const payload = jwt.verify(token, OAUTH_SECRET, { issuer: OAUTH_ISSUER });
            
            let user;
            if (payload.sub === 'admin') {
                 user = {
                    id: 'admin',
                    email: 'admin@localhost',
                    haUrl: process.env.HA_URL,
                    haToken: process.env.HA_TOKEN,
                    apiKey: ADMIN_API_KEY
                };
            } else {
                 user = Array.from(userManager.users.values()).find(u => u.id === payload.sub);
            }

            if (user) {
                // Validate user has HA credentials configured
                if (!user.haUrl || !user.haToken) {
                    log('warn', 'OAuth user missing HA credentials', { 
                        email: user.email,
                        hasUrl: !!user.haUrl,
                        hasToken: !!user.haToken
                    });
                    return res.status(403).json({
                        error: 'Home Assistant credentials not configured',
                        message: 'Please register your HA URL and token at the dashboard',
                        dashboardUrl: `${SERVER_URL}/dashboard`,
                        missingCredentials: {
                            haUrl: !user.haUrl,
                            haToken: !user.haToken
                        }
                    });
                }

                req.user = user;
                req.haConfig = {
                    url: user.haUrl,
                    token: user.haToken
                };
                if (user.apiKey) {
                    userManager.updateLastUsed(user.apiKey);
                }
                log('debug', 'OAuth authentication successful with HA credentials', { 
                    email: user.email,
                    haUrl: user.haUrl.substring(0, 20) + '...'
                });
                return next();
            }
        } catch (err) {
            log('warn', 'Invalid Bearer token received', { error: err.message });
        }
    }
    // For SSE requests from Claude.ai, return OAuth error instead of liberal auth
    if (req.headers.accept?.includes('text/event-stream')) {
        const userAgent = req.headers['user-agent'] || '';
        
        // If this is Claude.ai requesting tools without auth, return OAuth error
        if (userAgent.includes('python-httpx') || userAgent.includes('Claude')) {
            log('info', 'Claude.ai requesting tools without authentication - returning OAuth error');
            return res.status(401).json({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32001,
                    message: 'Unauthorized - OAuth authentication required',
                    data: {
                        auth_url: `${SERVER_URL}/.well-known/oauth-authorization-server`,
                        authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
                        registration_endpoint: `${SERVER_URL}/dashboard`
                    }
                }
            });
        }
        
        log('debug', 'SSE request - using liberal authentication mode');
        
        // Set default HA config if available for non-Claude requests
        if (process.env.HA_URL && process.env.HA_TOKEN) {
            req.haConfig = {
                url: process.env.HA_URL,
                token: process.env.HA_TOKEN
            };
            req.user = { email: 'anonymous@sse', id: 'sse-user' };
            return next();
        }
    }
    
    // Fallback to API key if Bearer token is missing or invalid
    return authenticate(req, res, next);
}

// OAuth Protected Resource Metadata
app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
        resource: SERVER_URL,
        authorization_servers: [SERVER_URL],
        scopes_supported: ["homeassistant:read", "homeassistant:write"]
    });
});

// Alternative OAuth metadata endpoint (some clients might use this)
app.get('/.well-known/openid_configuration', (req, res) => {
    res.redirect('/.well-known/oauth-authorization-server');
});

app.get('/.well-known/mcp', (req, res) => {
    res.json({
        version: "2024-11-05",
        name: "Home Assistant MCP",
        description: "Control and manage Home Assistant devices",
        methods: ['initialize', 'tools/call', 'prompts/list', 'resources/list', 'notifications/initialized']
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    log('error', 'Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        availableEndpoints: {
            GET: ['/', '/health', '/dashboard'],
            POST: ['/', '/register']
        }
    });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    log('info', 'SIGTERM received, saving user data...');
    await userManager.saveUsers();
    process.exit(0);
});

process.on('SIGINT', async () => {
    log('info', 'SIGINT received, saving user data...');
    await userManager.saveUsers();
    process.exit(0);
});

// Periodic user data saving (every 5 minutes)
setInterval(async () => {
    try {
        await userManager.saveUsers();
        log('debug', 'Periodic user data save completed');
    } catch (error) {
        log('error', 'Periodic save failed', error.message);
    }
}, 5 * 60 * 1000);

// Pure Node.js HTTP handler for MCP - bypassing Express entirely
function handleRawMCP(req, res) {
    const url = require('url');
    const parsedUrl = url.parse(req.url, true);
    
    log('info', `RAW MCP: ${req.method} ${parsedUrl.pathname}`, {
        userAgent: req.headers['user-agent'],
        accept: req.headers.accept
    });
    
    if (parsedUrl.pathname === '/raw-mcp') {
        // Set CORS headers exactly like N8N
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        const acceptHeader = req.headers.accept || '';
        const supportsSSE = acceptHeader.includes('text/event-stream');
        
        if (supportsSSE) {
            log('info', 'RAW MCP: Upgrading to SSE - pure Node.js');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
                'Mcp-Transport': 'streamable-http',
                'Mcp-Protocol-Version': '2024-11-05'
            });
            
            // Send connection established
            res.write('data: {"type":"connection","status":"established"}\\n\\n');
            
            // Send tools after delay
            setTimeout(() => {
                const tools = [
                    {
                        name: 'get_entities',
                        description: 'Get all Home Assistant entities or filter by domain',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Filter by domain (light, switch, sensor, etc.)' }
                            }
                        }
                    },
                    {
                        name: 'call_service',
                        description: 'Call a Home Assistant service to control devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                domain: { type: 'string', description: 'Service domain' },
                                service: { type: 'string', description: 'Service name' },
                                entity_id: { type: 'string', description: 'Target entity ID' },
                                data: { type: 'object', description: 'Additional service data' }
                            },
                            required: ['domain', 'service']
                        }
                    },
                    {
                        name: 'get_lights',
                        description: 'Get all light entities',
                        inputSchema: { type: 'object', properties: {} }
                    }
                ];
                
                const toolsNotification = {
                    jsonrpc: '2.0',
                    method: 'notifications/tools/list_changed',
                    params: {}
                };
                res.write(`data: ${JSON.stringify(toolsNotification)}\\n\\n`);
                
                const toolsMessage = {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 'raw-auto-' + Date.now(),
                    result: { tools: tools }
                };
                res.write(`data: ${JSON.stringify(toolsMessage)}\\n\\n`);
                
                log('info', `RAW MCP: Sent ${tools.length} tools via pure Node.js SSE`);
            }, 500);
            
            const keepAlive = setInterval(() => {
                res.write('data: {"type":"ping"}\\n\\n');
            }, 30000);
            
            req.on('close', () => {
                clearInterval(keepAlive);
                log('info', 'RAW MCP: SSE connection closed');
            });
            
            log('info', 'RAW MCP: Pure Node.js SSE connection established');
            return;
        }
    }
}

// Handle MCP requests with pure Node.js (exact N8N pattern)
async function handleMCPRequest(req, res, parsedUrl, acceptHeader, supportsSSE, supportsJSON) {
    const userAgent = req.headers['user-agent'] || '';
    
    log('info', `STREAMABLE HTTP 2025: ${req.method} request from ${userAgent}`);
    log('info', `STREAMABLE HTTP 2025: Accept: ${acceptHeader}`);
    log('info', `STREAMABLE HTTP 2025: Transport support - SSE: ${supportsSSE}, JSON: ${supportsJSON}`);
    
    // Only set default HA config if OAuth didn't already set it
    if (!req.haConfig && process.env.HA_URL && process.env.HA_TOKEN) {
        req.haConfig = {
            url: process.env.HA_URL,
            token: process.env.HA_TOKEN
        };
        req.user = { email: 'mcp@claude.ai', id: 'mcp-user' };
        log('debug', 'Using default HA config for non-authenticated MCP requests');
    } else if (req.haConfig) {
        log('debug', 'Using OAuth user HA config for MCP requests', { email: req.user?.email });
    }
    
    // Handle GET requests for SSE upgrade
    if (req.method === 'GET') {
        log('info', 'STREAMABLE HTTP 2025: GET request - checking for SSE upgrade');
        
        if (supportsSSE) {
            log('info', 'STREAMABLE HTTP 2025: Upgrading to SSE connection');
            
            // SSE Response headers per MCP spec
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept',
                'Mcp-Transport': 'streamable-http',
                'Mcp-Protocol-Version': '2024-11-05'
            });
            
            // Send SSE connection established event
            res.write('data: {"type":"connection","status":"established"}\n\n');
            
            // Send tools list as proper MCP notification
            setTimeout(async () => {
                try {
                    // Get real tools using the existing JSON-RPC handler
                    const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: {}, id: 'sse-auto' }, req.haConfig, req.user);
                    const tools = toolsResponse.result.tools;
                    
                    // Send tools as a tools/list_changed notification per MCP spec
                    const toolsNotification = {
                        jsonrpc: '2.0',
                        method: 'notifications/tools/list_changed',
                        params: {}
                    };
                    
                    log('info', `STREAMABLE HTTP 2025: Sending tools/list_changed notification over SSE`);
                    res.write(`data: ${JSON.stringify(toolsNotification)}\n\n`);
                    
                    // Then send tools as a proper response that Claude should pick up
                    const toolsMessage = {
                        jsonrpc: '2.0',
                        method: 'tools/list',
                        id: 'sse-auto-' + Date.now(),
                        result: {
                            tools: tools
                        }
                    };
                    
                    log('info', `STREAMABLE HTTP 2025: Auto-sending tools/list over SSE (${tools.length} tools)`);
                    res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
                    
                } catch (err) {
                    log('error', 'STREAMABLE HTTP 2025: Error sending tools over SSE:', err);
                }
            }, 500);
            
            // Keep connection alive
            const keepAlive = setInterval(() => {
                res.write('data: {"type":"ping"}\n\n');
            }, 30000);
            
            req.on('close', () => {
                clearInterval(keepAlive);
                log('info', 'STREAMABLE HTTP 2025: SSE connection closed');
            });
            
            return;
        } else {
            // GET without SSE support - return server info
            log('info', 'STREAMABLE HTTP 2025: GET request without SSE - returning server info');
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Mcp-Transport': 'streamable-http',
                'Mcp-Protocol-Version': '2024-11-05'
            });
            res.end(JSON.stringify({
                name: 'HA MCP Server',
                version: '2.0.0',
                description: 'Home Assistant Model Context Protocol Server with Streamable HTTP',
                transport: 'streamable-http',
                protocol: '2024-11-05',
                capabilities: {
                    tools: { listChanged: true },
                    prompts: {}
                }
            }));
            return;
        }
    }
    
    // Handle POST requests for MCP messages
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                log('info', `STREAMABLE HTTP 2025: Received POST body: ${body}`);
                const message = JSON.parse(body);
                
                // Use existing JSON-RPC handler but add Claude.ai hacks for discovery
                let response;
                
                if (message.method === 'prompts/list') {
                    // CRITICAL: Claude.ai tool discovery hack - send tools when it asks for prompts
                    log('warn', 'STREAMABLE HTTP 2025: Claude.ai tools-in-prompts hack activated');
                    const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: message.params, id: message.id }, req.haConfig, req.user);
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: toolsResponse.result  // Send tools instead of prompts!
                    };
                } else if (message.method === 'resources/list') {
                    // Another Claude.ai hack - send empty resources but also tools
                    log('warn', 'STREAMABLE HTTP 2025: Claude.ai resources/list hack - sending tools');
                    const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: message.params, id: message.id }, req.haConfig, req.user);
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: { 
                            resources: [],
                            tools: toolsResponse.result.tools  // Send tools here too!
                        }
                    };
                } else {
                    // Use existing JSON-RPC handler for all other methods
                    response = await handleJsonRpcMessage(message, req.haConfig, req.user);
                }
                
                log('info', `STREAMABLE HTTP 2025: Sending response: ${JSON.stringify(response)}`);
                
                // Check if Claude.ai wants SSE after initialize
                const acceptHeader = req.headers.accept || '';
                const supportsSSE = acceptHeader.includes('text/event-stream');
                
                if (message.method === 'initialize' && supportsSSE) {
                    log('info', 'STREAMABLE HTTP 2025: Claude.ai wants SSE - switching to SSE mode after initialize');
                    
                    // Send SSE headers instead of JSON
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept',
                        'Mcp-Transport': 'streamable-http',
                        'Mcp-Protocol-Version': '2024-11-05'
                    });
                    
                    // Send initialize response as SSE event
                    res.write(`data: ${JSON.stringify(response)}\n\n`);
                    
                    // Auto-push tools after initialize (N8N pattern)
                    setTimeout(async () => {
                        try {
                            const toolsResponse = await handleJsonRpcMessage({ method: 'tools/list', params: {}, id: 'sse-auto' }, req.haConfig, req.user);
                            const tools = toolsResponse.result.tools;
                            
                            // Send tools as MCP notification
                            const toolsNotification = {
                                jsonrpc: '2.0',
                                method: 'notifications/tools/list_changed',
                                params: {}
                            };
                            res.write(`data: ${JSON.stringify(toolsNotification)}\n\n`);
                            
                            // Send tools as response
                            const toolsMessage = {
                                jsonrpc: '2.0',
                                method: 'tools/list',
                                id: 'sse-auto-' + Date.now(),
                                result: { tools: tools }
                            };
                            
                            log('info', `STREAMABLE HTTP 2025: Auto-pushing ${tools.length} tools via SSE after initialize`);
                            res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
                            
                        } catch (err) {
                            log('error', 'STREAMABLE HTTP 2025: Error auto-pushing tools:', err);
                        }
                    }, 500);
                    
                    // Keep connection alive
                    const keepAlive = setInterval(() => {
                        res.write('data: {"type":"ping"}\n\n');
                    }, 30000);
                    
                    req.on('close', () => {
                        clearInterval(keepAlive);
                        log('info', 'STREAMABLE HTTP 2025: SSE connection closed after initialize');
                    });
                    
                } else {
                    // Normal JSON response
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept',
                        'Mcp-Transport': 'streamable-http',
                        'Mcp-Protocol-Version': '2024-11-05'
                    });
                    res.end(JSON.stringify(response));
                }
                
            } catch (error) {
                log('error', 'STREAMABLE HTTP 2025: Error processing POST request:', error);
                res.writeHead(400, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: 'Parse error',
                        data: error.message
                    }
                }));
            }
        });
        return;
    }
    
    // Handle OPTIONS requests for CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept'
        });
        res.end();
        return;
    }
    
    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
}

// Initialize and start server
async function startServer() {
    try {
        await initializeDataDir();
        
        // Create HTTP server with custom handler for MCP
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const acceptHeader = req.headers.accept || '';
            const supportsSSE = acceptHeader.includes('text/event-stream');
            const supportsJSON = acceptHeader.includes('application/json');
            
            // DISABLED: Let all requests go through Express OAuth middleware
            // The pure Node.js handler was bypassing OAuth authentication
            // Claude.ai needs proper OAuth flow to show tools in web UI
            
            // Let Express handle all other routes
            app(req, res);
        });

        server.listen(PORT, '0.0.0.0', () => {
            log('info', `${colors.green}✅ HA MCP Bridge Server running on port ${PORT}${colors.reset}`);
            log('info', `🌐 Server URL: ${SERVER_URL}`);
            log('info', `🎛️ Dashboard: ${SERVER_URL}/dashboard`);
            log('info', `📊 Health check: ${SERVER_URL}/health`);
            log('info', `🔧 Mode: ${MULTI_TENANT ? 'Multi-tenant' : 'Single-tenant'}`);
            log('info', `📝 Registration: ${ENABLE_USER_REGISTRATION ? 'Enabled' : 'Disabled'}`);
            log('info', `👥 Users: ${userManager.users.size}`);
            log('info', `🔑 Admin API: ${ADMIN_API_KEY ? 'Configured' : 'Not set'}`);
            
            if (ENABLE_USER_REGISTRATION) {
                log('info', `${colors.cyan}🚀 Users can register at: ${SERVER_URL}/dashboard${colors.reset}`);
            }
            
            if (!ADMIN_API_KEY || ADMIN_API_KEY.startsWith('admin-')) {
                log('warn', `⚠️  Using auto-generated admin key: ${ADMIN_API_KEY}`);
                log('warn', `   Set ADMIN_API_KEY environment variable for production`);
            }
        });

        // WebSocket server for MCP communication
        const wss = new WebSocket.Server({ server });
        
        wss.on('connection', (ws, req) => {
            log('info', 'WebSocket connection established');
            
            let user = null;
            let haConfig = null;
            
            // Handle authentication via query parameters or headers
            const url = new URL(req.url, `http://${req.headers.host}`);
            const apiKey = url.searchParams.get('api_key') || req.headers['x-api-key'];
            const haUrl = url.searchParams.get('ha_url') || req.headers['ha-url'];
            const haToken = url.searchParams.get('ha_token') || req.headers['ha-token'];
            
            if (apiKey) {
                user = userManager.getUser(apiKey);
                if (user) {
                    haConfig = { url: user.haUrl, token: user.haToken };
                    log('debug', 'WebSocket authenticated via API key', { email: user.email });
                }
            }
            
            // If no API key, try Bearer token
            if (!user) {
                const auth = req.headers.authorization;
                if (auth && auth.startsWith('Bearer ')) {
                    const token = auth.slice(7);
                    try {
                        const payload = jwt.verify(token, OAUTH_SECRET);
                        user = Array.from(userManager.users.values()).find(u => u.email === payload.email);
                        if (user) {
                            haConfig = { url: user.haUrl, token: user.haToken };
                            log('debug', 'WebSocket authenticated via Bearer token', { email: user.email });
                        }
                    } catch (error) {
                        log('debug', 'WebSocket Bearer token verification failed');
                    }
                }
            }
            
            // If still no user, try direct HA config from headers
            if (!user && haUrl && haToken) {
                haConfig = { url: haUrl, token: haToken };
                log('debug', 'WebSocket using direct HA config from headers');
            }
            
            if (!haConfig) {
                log('warn', 'WebSocket connection rejected - no valid authentication');
                ws.close(1008, 'Authentication required');
                return;
            }
            
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    log('debug', 'WebSocket MCP message received', { method: message.method });
                    
                    const response = await handleJsonRpcMessage(message, haConfig, user);
                    ws.send(JSON.stringify(response));
                    
                } catch (error) {
                    log('error', 'WebSocket message handling error', error.message);
                    const errorResponse = {
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32603,
                            message: error.message
                        }
                    };
                    ws.send(JSON.stringify(errorResponse));
                }
            });
            
            ws.on('close', () => {
                log('debug', 'WebSocket connection closed');
            });
            
            ws.on('error', (error) => {
                log('error', 'WebSocket error', error.message);
            });
        });
        
        log('info', `🔌 WebSocket server enabled on /ws`);

    } catch (error) {
        log('error', 'Failed to start server', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Endpoint for users to update their Home Assistant URL and token
app.post('/update-ha-config', authenticateOAuth, async (req, res) => {
    const { haUrl, haToken } = req.body;
    if (!haUrl || !haToken) {
        return res.status(400).json({ error: 'haUrl and haToken are required.' });
    }
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    await userManager.updateUser(req.user.apiKey, { haUrl, haToken });
    res.json({ success: true, message: 'Home Assistant configuration updated.' });
});