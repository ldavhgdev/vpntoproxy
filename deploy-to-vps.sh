#!/bin/bash
# Deploy updated app.js to Ubuntu VPS with log viewing support
# Usage: bash deploy-to-vps.sh <vps-user>@<vps-ip>

VPS="${1:-root@160.250.247.233}"
REMOTE_DIR="/opt/proxy-manager"

echo "📦 Deploying app.js to $VPS:$REMOTE_DIR"

# Copy updated app.js
scp nodejs-app.js "$VPS:$REMOTE_DIR/app.js" || {
  echo "❌ SCP failed"
  exit 1
}

# Restart service
ssh "$VPS" << 'EOF'
  set -e
  echo "🔄 Restarting proxy-manager service..."
  sudo systemctl restart proxy-manager
  sleep 2

  # Check if running
  if sudo systemctl is-active --quiet proxy-manager; then
    echo "✅ Service restarted successfully"

    # Test API
    if curl -s http://127.0.0.1:8686/api/state > /dev/null 2>&1; then
      echo "✅ API is responding"
    else
      echo "⚠️  API not responding yet, check logs:"
      sudo journalctl -u proxy-manager -n 20 --no-pager
    fi
  else
    echo "❌ Service failed to start"
    sudo journalctl -u proxy-manager -n 30 --no-pager
    exit 1
  fi
EOF

echo "✅ Deployment complete!"
echo ""
echo "Test the log endpoint:"
echo "  curl http://160.250.247.233:8686/api/tunnels/304d0a0a/log"
