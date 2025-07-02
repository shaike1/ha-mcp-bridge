# Deployment Guide: Docker Hub & HAOS Community

## Step 1: Docker Hub Setup

### 1.1 Create Docker Hub Account
1. Go to https://hub.docker.com and sign up
2. Choose username (e.g., `yourusername`)

### 1.2 Generate Access Token
1. Go to Account Settings → Security → Access Tokens
2. Click "New Access Token"
3. Name: "GitHub Actions"
4. Permissions: "Read, Write, Delete"
5. Copy the token (keep it secure!)

### 1.3 Configure GitHub Secrets
In your GitHub repository:
1. Go to Settings → Secrets and variables → Actions
2. Add repository secrets:
   - `DOCKERHUB_USERNAME`: Your Docker Hub username
   - `DOCKERHUB_TOKEN`: The access token from step 1.2

### 1.4 Update Repository References
Replace `yourusername` in these files with your actual username:
- `.github/workflows/docker-publish.yml`
- `haos-addon/config.yaml`
- `docker-compose.registry.yml`
- `README.md`

## Step 2: HAOS Community Repository

### 2.1 Create Community Add-on Repository
1. Create new GitHub repository: `ha-mcp-addons`
2. Copy the `haos-addon/` folder to the new repository
3. Rename `haos-addon/` to `ha-mcp-server/`
4. Add `repository.yaml` file in root

### 2.2 Repository Structure
```
ha-mcp-addons/
├── repository.yaml
└── ha-mcp-server/
    ├── config.yaml
    ├── Dockerfile
    ├── run.sh
    └── README.md
```

### 2.3 Test Add-on Installation
1. In Home Assistant, go to Supervisor → Add-on Store
2. Click "..." → Repositories
3. Add: `https://github.com/yourusername/ha-mcp-addons`
4. Your add-on should appear in the store

## Step 3: Submit to Official Community

### 3.1 Prerequisites
- Add-on tested and working
- Proper documentation
- Follows HAOS add-on guidelines
- Multi-architecture support

### 3.2 Submit to Community Add-ons
1. Fork https://github.com/hassio-addons/repository
2. Add your add-on to the appropriate category
3. Submit pull request with:
   - Clear description
   - Screenshots
   - Testing evidence
   - Security considerations

### 3.3 Alternative: Home Assistant Community Store (HACS)
1. Ensure your repository follows HACS guidelines
2. Submit to HACS default repositories
3. Users can install via HACS → Add-ons

## Step 4: Automated Deployment

### 4.1 Tag-based Releases
```bash
# Create and push a release tag
git tag -a v2.0.0 -m "Release version 2.0.0"
git push origin v2.0.0
```

### 4.2 Automated Builds
The GitHub Actions will automatically:
- Build multi-architecture containers
- Push to Docker Hub and GitHub Container Registry
- Update Docker Hub description

## Step 5: Usage Instructions

### Docker Hub
```bash
docker run -d --name ha-mcp-server \
  -p 3000:3000 \
  -e SERVER_URL=https://your-domain.com \
  -e HA_URL=https://your-ha-instance.com \
  -e HA_TOKEN=your_token \
  shaikeme/ha-mcp-server:latest
```

### HAOS Add-on
1. Add repository: `https://github.com/shaike1/ha-mcp-addons`
2. Install "Home Assistant MCP Server"
3. Configure options
4. Start add-on
5. Connect to Claude.ai

## Troubleshooting

### Docker Hub Issues
- Verify secrets are set correctly
- Check repository permissions
- Ensure Docker Hub repository exists

### HAOS Add-on Issues
- Validate config.yaml syntax
- Check image references
- Test with local add-on first
- Review Home Assistant supervisor logs

### Build Failures
- Check GitHub Actions logs
- Verify Dockerfile syntax
- Ensure all dependencies are available
- Test builds locally first

## Security Considerations

- Never commit secrets to repository
- Use secure access tokens
- Regularly rotate Docker Hub tokens
- Follow HAOS security guidelines
- Implement proper input validation