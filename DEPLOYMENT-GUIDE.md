# HA MCP Bridge - Deployment Guide

This guide covers two deployment methods for the HA MCP Bridge: **Docker Container** (advanced users) and **Home Assistant Add-on** (HAOS users).

## 🐳 **Method 1: Docker Container (Recommended for Advanced Users)**

### **Features:**
- ✅ Full control over configuration
- ✅ Built-in Cloudflared tunnel support
- ✅ Multi-architecture support (amd64, arm64, arm)
- ✅ Process management with supervisor
- ✅ Real-time logging and monitoring

### **Repository:**
```
https://github.com/shaike1/ha-mcp-bridge
```

### **Quick Start:**
1. **Clone repository:**
   ```bash
   git clone https://github.com/shaike1/ha-mcp-bridge.git
   cd ha-mcp-bridge
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start with Docker Compose:**
   ```bash
   docker-compose up -d ha-mcp-bridge
   ```

### **Cloudflared Configuration:**
Set your tunnel token in docker-compose.yml:
```yaml
environment:
  - CLOUDFLARED_TOKEN=eyJhIjoiMWUzMzMwZjI0OTY4OTg4ZDIyMzMxMDNiZjA4NzE4NjU...
```

### **Access:**
- **Local**: `http://localhost:3003`
- **Tunnel**: `https://your-tunnel-domain.com`
- **Health**: `/health` endpoint shows service status

---

## 🏠 **Method 2: Home Assistant Add-on (HAOS Users)**

### **Features:**
- ✅ Native HAOS integration
- ✅ Web UI configuration
- ✅ Automatic HA token management
- ✅ Cloudflared tunnel support
- ✅ Multiple access methods (Nabu Casa, Cloudflared, Port Forward)

### **Repository:**
```
https://github.com/shaike1/haos-mcp
```

### **Installation:**

#### **Step 1: Add Repository**
1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click **⋮** (three dots) → **Repositories**
3. Add: `https://github.com/shaike1/haos-mcp`
4. Click **ADD**

#### **Step 2: Install Add-on**
1. Find **"HA MCP Bridge"** in the add-on store
2. Click **INSTALL**
3. Wait for installation to complete

#### **Step 3: Configure Add-on**

##### **Option A: Cloudflared Tunnel (Recommended)**
```yaml
external_access:
  enabled: true
  method: "cloudflared"
server_url: "https://your-tunnel-domain.com"
cloudflared:
  enabled: true
  token: "eyJhIjoiMWUzMzMwZjI0OTY4OTg4ZDIyMzMxMDNiZjA4NzE4NjU..."
oauth:
  admin_username: "admin"
  admin_password: "your-secure-password"
```

##### **Option B: Nabu Casa Cloud**
```yaml
external_access:
  enabled: true
  method: "nabu_casa"
nabu_casa:
  expose_port: true
  auto_ssl: true
oauth:
  admin_username: "admin"
  admin_password: "your-secure-password"
```

##### **Option C: Port Forwarding**
```yaml
external_access:
  enabled: true
  method: "port_forward"
server_url: "https://your-domain.com:3003"
oauth:
  admin_username: "admin"
  admin_password: "your-secure-password"
```

#### **Step 4: Start Add-on**
1. Click **START**
2. Enable **"Start on boot"** and **"Watchdog"**
3. Check logs for successful startup

### **Access:**
- **Web UI**: Add-on dashboard or ingress
- **Direct**: `http://hassio-host:3003`
- **External**: Based on your access method configuration

---

## 🔧 **Cloudflared Tunnel Setup**

### **1. Create Tunnel (Both Methods):**
1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Click **Create a tunnel** → **Cloudflared**
4. Name your tunnel (e.g., "ha-mcp-bridge")
5. Copy the tunnel token

### **2. Configure Public Hostname:**
1. Add **Public Hostname**:
   - **Subdomain**: `ha-mcp` (or your choice)
   - **Domain**: `your-domain.com`
   - **Service**: `http://localhost:3003` (Docker) or `http://hassio-host:3003` (Add-on)

### **3. Update Configuration:**
- **Docker**: Set `CLOUDFLARED_TOKEN` in docker-compose.yml
- **Add-on**: Set `cloudflared.token` in add-on configuration

---

## 🔐 **Security Configuration**

### **Admin Credentials:**
- **Username**: `admin` (configurable in add-on)
- **Password**: Set strong password, not default
- **OAuth**: Enable for Claude.ai integration

### **Access Control:**
- Use Cloudflare Access for additional authentication
- Enable HTTPS/TLS for all external access
- Rotate tunnel tokens periodically

---

## 🚀 **Claude.ai Integration**

Both methods work with Claude.ai MCP integration:

1. **Add MCP Server** in Claude.ai
2. **Server URL**: Your tunnel URL or external endpoint
3. **Authentication**: Use OAuth flow (admin credentials)
4. **Test**: Try basic commands like "list my lights"

---

## 📊 **Comparison**

| Feature | Docker Container | HAOS Add-on |
|---------|-----------------|-------------|
| **Setup Complexity** | Advanced | Beginner-friendly |
| **Configuration** | File-based | Web UI |
| **Cloudflared** | ✅ Built-in | ✅ Optional |
| **HA Integration** | Manual token | Automatic |
| **Process Management** | Supervisor | S6 Overlay |
| **Logging** | File + Docker | Add-on logs |
| **Updates** | Git pull | Add-on store |
| **Best For** | Advanced users | HAOS users |

---

## 🆘 **Troubleshooting**

### **Common Issues:**

#### **Add-on Repository Not Valid:**
- Ensure repository URL is exactly: `https://github.com/shaike1/haos-mcp`
- Check HAOS version compatibility
- Try refreshing add-on store

#### **Cloudflared Not Connecting:**
- Verify tunnel token is valid
- Check tunnel status in Cloudflare dashboard
- Ensure public hostname is configured correctly

#### **Claude.ai Can't Connect:**
- Verify external URL is accessible
- Check OAuth configuration
- Test health endpoint: `https://your-url/health`

### **Getting Help:**
- **Issues**: [GitHub Issues](https://github.com/shaike1/ha-mcp-bridge/issues)
- **Docs**: Repository README files
- **Logs**: Check container/add-on logs for errors

---

## 📝 **Next Steps**

1. **Choose deployment method** based on your setup
2. **Configure Cloudflared tunnel** for secure access
3. **Set up Claude.ai integration** 
4. **Test functionality** with basic commands
5. **Explore advanced features** and customization

Both deployment methods provide the same core functionality - choose based on your technical comfort level and infrastructure preferences!