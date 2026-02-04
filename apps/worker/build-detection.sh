#!/bin/bash
# Build System Detection for Squire Worker
# Phase 1: Detect and log build system (no behavior change yet)

# Detect build system in current directory
# Returns: bazel|nix|devbox|pnpm|npm|yarn|go|cargo|unknown
detect_build_system() {
    local repo_path="${1:-.}"
    
    # Priority order (most specific first)
    
    # Bazel (bzlmod or workspace)
    if [ -f "${repo_path}/MODULE.bazel" ]; then
        echo "bazel-bzlmod"
        return 0
    fi
    if [ -f "${repo_path}/WORKSPACE.bazel" ] || [ -f "${repo_path}/WORKSPACE" ]; then
        echo "bazel-workspace"
        return 0
    fi
    
    # Nix
    if [ -f "${repo_path}/flake.nix" ]; then
        echo "nix-flakes"
        return 0
    fi
    if [ -f "${repo_path}/default.nix" ] || [ -f "${repo_path}/shell.nix" ]; then
        echo "nix-legacy"
        return 0
    fi
    
    # Devbox
    if [ -f "${repo_path}/devbox.json" ]; then
        echo "devbox"
        return 0
    fi
    
    # Mise / asdf
    if [ -f "${repo_path}/.mise.toml" ] || [ -f "${repo_path}/mise.toml" ]; then
        echo "mise"
        return 0
    fi
    if [ -f "${repo_path}/.tool-versions" ]; then
        echo "asdf"
        return 0
    fi
    
    # Node.js package managers (check lockfiles)
    if [ -f "${repo_path}/pnpm-lock.yaml" ]; then
        echo "pnpm"
        return 0
    fi
    if [ -f "${repo_path}/yarn.lock" ]; then
        echo "yarn"
        return 0
    fi
    if [ -f "${repo_path}/bun.lockb" ]; then
        echo "bun"
        return 0
    fi
    if [ -f "${repo_path}/package-lock.json" ]; then
        echo "npm"
        return 0
    fi
    if [ -f "${repo_path}/package.json" ]; then
        echo "node-unknown"
        return 0
    fi
    
    # Go
    if [ -f "${repo_path}/go.mod" ]; then
        echo "go"
        return 0
    fi
    
    # Rust
    if [ -f "${repo_path}/Cargo.toml" ]; then
        echo "cargo"
        return 0
    fi
    
    # Python
    if [ -f "${repo_path}/pyproject.toml" ]; then
        echo "python-pyproject"
        return 0
    fi
    if [ -f "${repo_path}/requirements.txt" ]; then
        echo "python-pip"
        return 0
    fi
    
    # Deno
    if [ -f "${repo_path}/deno.json" ] || [ -f "${repo_path}/deno.jsonc" ]; then
        echo "deno"
        return 0
    fi
    
    echo "unknown"
    return 0
}

# Get environment entry command for build system
get_env_command() {
    local build_system="$1"
    
    case "$build_system" in
        nix-flakes)
            echo "nix develop --command bash"
            ;;
        nix-legacy)
            echo "nix-shell --run bash"
            ;;
        devbox)
            echo "devbox shell"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get validation command for build system
get_validation_command() {
    local build_system="$1"
    
    case "$build_system" in
        bazel-bzlmod|bazel-workspace)
            echo "bazel build //... && bazel test //..."
            ;;
        nix-flakes)
            echo "nix flake check"
            ;;
        pnpm)
            echo "pnpm install --frozen-lockfile && pnpm test"
            ;;
        npm)
            echo "npm ci && npm test"
            ;;
        yarn)
            echo "yarn install --frozen-lockfile && yarn test"
            ;;
        bun)
            echo "bun install && bun test"
            ;;
        go)
            echo "go build ./... && go test ./..."
            ;;
        cargo)
            echo "cargo build && cargo test"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Log build system detection (Phase 1)
log_build_system() {
    local repo_path="${1:-.}"
    local build_system=$(detect_build_system "$repo_path")
    local env_cmd=$(get_env_command "$build_system")
    local validate_cmd=$(get_validation_command "$build_system")
    
    echo "=== Build System Detection ==="
    echo "Detected: ${build_system}"
    
    if [ -n "$env_cmd" ]; then
        echo "Environment: ${env_cmd}"
    fi
    
    if [ -n "$validate_cmd" ]; then
        echo "Validation: ${validate_cmd}"
    else
        echo "Validation: (none configured)"
    fi
    
    echo "=============================="
    echo ""
    
    # Export for use in entrypoint
    export SQUIRE_BUILD_SYSTEM="$build_system"
    export SQUIRE_ENV_CMD="$env_cmd"
    export SQUIRE_VALIDATE_CMD="$validate_cmd"
}

# If run directly, detect in current dir
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    log_build_system "${1:-.}"
fi
