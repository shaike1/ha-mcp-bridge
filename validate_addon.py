#!/usr/bin/env python3
import yaml
import requests
import sys

def validate_repository():
    """Validate the HA add-on repository structure like Home Assistant would"""
    
    base_url = "https://raw.githubusercontent.com/shaike1/haos-mcp/main"
    
    print("🔍 Validating Home Assistant Add-on Repository...")
    print("=" * 50)
    
    # 1. Check repository.yaml
    try:
        repo_response = requests.get(f"{base_url}/repository.yaml")
        if repo_response.status_code == 200:
            repo_data = yaml.safe_load(repo_response.text)
            print("✅ repository.yaml found and valid")
            print(f"   Name: {repo_data.get('name')}")
            print(f"   Maintainer: {repo_data.get('maintainer')}")
        else:
            print("❌ repository.yaml not found")
            return False
    except Exception as e:
        print(f"❌ Error parsing repository.yaml: {e}")
        return False
    
    # 2. Check add-on config.yaml
    try:
        config_response = requests.get(f"{base_url}/ha-mcp-bridge/config.yaml")
        if config_response.status_code == 200:
            config_data = yaml.safe_load(config_response.text)
            print("✅ ha-mcp-bridge/config.yaml found and valid")
            print(f"   Add-on Name: {config_data.get('name')}")
            print(f"   Version: {config_data.get('version')}")
            print(f"   Slug: {config_data.get('slug')}")
            print(f"   Architectures: {config_data.get('arch')}")
            
            # Check required fields
            required_fields = ['name', 'version', 'slug', 'description', 'arch']
            missing_fields = [field for field in required_fields if not config_data.get(field)]
            if missing_fields:
                print(f"❌ Missing required fields: {missing_fields}")
                return False
            else:
                print("✅ All required fields present")
                
        else:
            print("❌ ha-mcp-bridge/config.yaml not found")
            return False
    except Exception as e:
        print(f"❌ Error parsing config.yaml: {e}")
        return False
    
    # 3. Check Dockerfile
    dockerfile_response = requests.get(f"{base_url}/ha-mcp-bridge/Dockerfile")
    if dockerfile_response.status_code == 200:
        print("✅ Dockerfile found")
    else:
        print("⚠️  Dockerfile not found (optional but recommended)")
    
    # 4. Check icon
    icon_response = requests.get(f"{base_url}/ha-mcp-bridge/icon.png")
    if icon_response.status_code == 200:
        print("✅ icon.png found")
    else:
        print("⚠️  icon.png not found (optional but recommended)")
    
    print("=" * 50)
    print("🎯 VALIDATION RESULT: Repository structure is VALID for Home Assistant!")
    print("\n📝 Repository URL to use in HA: https://github.com/shaike1/haos-mcp")
    print("🔍 Add-on should appear as:", config_data.get('name'))
    
    return True

if __name__ == "__main__":
    try:
        validate_repository()
    except Exception as e:
        print(f"❌ Validation failed: {e}")
        sys.exit(1)