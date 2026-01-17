#!/bin/bash
# Setup gVisor (runsc) for enhanced container isolation
# https://gvisor.dev/docs/user_guide/install/

set -e

echo "=== Installing gVisor (runsc) ==="

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        URL="https://storage.googleapis.com/gvisor/releases/release/latest/x86_64"
        ;;
    aarch64|arm64)
        URL="https://storage.googleapis.com/gvisor/releases/release/latest/aarch64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Download and install runsc
echo "Downloading runsc for $ARCH..."
curl -fsSL "${URL}/runsc" -o /tmp/runsc
curl -fsSL "${URL}/containerd-shim-runsc-v1" -o /tmp/containerd-shim-runsc-v1

echo "Installing to /usr/local/bin..."
sudo install -m 755 /tmp/runsc /usr/local/bin/runsc
sudo install -m 755 /tmp/containerd-shim-runsc-v1 /usr/local/bin/containerd-shim-runsc-v1

# Clean up
rm -f /tmp/runsc /tmp/containerd-shim-runsc-v1

# Verify installation
echo "Verifying installation..."
runsc --version

# Configure Docker daemon
echo ""
echo "=== Configuring Docker ==="

DAEMON_JSON="/etc/docker/daemon.json"

# Check if daemon.json exists and has content
if [ -f "$DAEMON_JSON" ] && [ -s "$DAEMON_JSON" ]; then
    # Backup existing config
    sudo cp "$DAEMON_JSON" "${DAEMON_JSON}.bak"
    
    # Check if runsc runtime is already configured
    if grep -q '"runsc"' "$DAEMON_JSON"; then
        echo "runsc runtime already configured in $DAEMON_JSON"
    else
        echo "Adding runsc runtime to existing $DAEMON_JSON..."
        # Use jq to merge the runtime config
        if command -v jq &> /dev/null; then
            sudo jq '.runtimes.runsc = {"path": "/usr/local/bin/runsc"}' "$DAEMON_JSON" > /tmp/daemon.json
            sudo mv /tmp/daemon.json "$DAEMON_JSON"
        else
            echo "WARNING: jq not installed. Please manually add to $DAEMON_JSON:"
            echo '  "runtimes": { "runsc": { "path": "/usr/local/bin/runsc" } }'
        fi
    fi
else
    echo "Creating $DAEMON_JSON..."
    sudo mkdir -p /etc/docker
    echo '{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc"
    }
  }
}' | sudo tee "$DAEMON_JSON"
fi

echo ""
echo "=== Restarting Docker ==="
sudo systemctl restart docker

echo ""
echo "=== Testing gVisor ==="
echo "Running test container with runsc runtime..."
if docker run --rm --runtime=runsc hello-world; then
    echo ""
    echo "✅ gVisor installed and working!"
    echo ""
    echo "To enable for Squire, set:"
    echo "  export SQUIRE_CONTAINER_RUNTIME=runsc"
    echo ""
    echo "Or add to squire.config.json:"
    echo '  { "containerRuntime": "runsc" }'
else
    echo ""
    echo "❌ gVisor test failed. Check Docker logs:"
    echo "  sudo journalctl -u docker -n 50"
fi
