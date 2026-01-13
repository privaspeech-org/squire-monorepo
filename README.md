---
name: jules-clone
description: Async coding agent - fire and forget, come back to a PR. Like Google's Jules but local.
---

# Jules Clone

Async coding agent that works autonomously in Docker containers using OpenCode.

## Location

- **Repo:** https://github.com/carlulsoe/jules-clone
- **Local:** `/root/repos/jules-clone`
- **CLI:** `jules` (after npm link or running via node)

## Quick Start

```bash
cd /root/repos/jules-clone
export GITHUB_TOKEN=$(gh auth token)

# Create a task
jules new owner/repo "Add feature X"

# Check status
jules status <task-id>

# View logs
jules logs <task-id>
```

## Commands

### Core

| Command | Description |
|---------|-------------|
| `jules new <repo> "<prompt>"` | Create and start a coding task |
| `jules list` | List all tasks |
| `jules status <id>` | Get task details |
| `jules logs <id>` | View container logs |

### Task Management

| Command | Description |
|---------|-------------|
| `jules start <id>` | Start a pending task |
| `jules stop <id>` | Stop a running task |
| `jules retry <id>` | Retry a failed task |
| `jules followup <id> "<prompt>"` | Continue work on same branch |

### Monitoring

| Command | Description |
|---------|-------------|
| `jules ps` | Show running tasks |
| `jules watch` | Watch + auto-start queued tasks |
| `jules webhook` | Start webhook server for GitHub events |

### Maintenance

| Command | Description |
|---------|-------------|
| `jules clean` | Remove completed/failed tasks |
| `jules config` | View/set configuration |

## Workflow Examples

### Simple task
```bash
jules new privaspeech-org/privaspeech "Add a health check endpoint to the API"
# Wait for completion...
jules status <id>
# PR created automatically!
```

### Follow-up on completed task
```bash
jules followup <id> "Also add tests for the health check"
# Continues on same branch, comments on existing PR
```

### Retry with better model
```bash
jules retry <id> --model anthropic/claude-sonnet-4
```

### CI failure auto-fix
```bash
# Start webhook server with auto-fix enabled
jules webhook --auto-fix-ci

# When CI fails, automatically creates follow-up task to fix it
```

### Greptile/bot review auto-fix
```bash
# Start webhook server with review auto-fix
jules webhook --auto-fix-reviews

# When Greptile (or other bots) post review comments, 
# automatically creates follow-up task to address them

# Custom bot list (comma-separated)
jules webhook --auto-fix-reviews --review-bots "greptile[bot],coderabbit[bot]"

# Combine with CI auto-fix for full automation
jules webhook --auto-fix-ci --auto-fix-reviews
```

### Parallel tasks with limits
```bash
jules config maxConcurrent 3  # Limit to 3 parallel tasks
jules new repo1 "Task 1"
jules new repo2 "Task 2"
jules new repo3 "Task 3"
jules new repo4 "Task 4"  # Queued, waiting for slot

# Watch will auto-start queued tasks
jules watch
```

## Configuration

Set GitHub token:
```bash
export GITHUB_TOKEN=$(gh auth token)
# Or persist:
jules config githubToken $(gh auth token)
```

Set model:
```bash
jules config model opencode/glm-4.7-free  # Free (default)
jules config model anthropic/claude-sonnet-4  # Better but paid
```

Set parallel limit:
```bash
jules config maxConcurrent 5
```

## Models

| Model | Cost | Notes |
|-------|------|-------|
| `opencode/glm-4.7-free` | Free | Default, good for simple tasks |
| `opencode/minimax-m2.1-free` | Free | Alternative free model |
| `anthropic/claude-sonnet-4` | Paid | Better for complex tasks |

## Building

If you need to rebuild the Docker image:
```bash
cd /root/repos/jules-clone
docker build -t jules-worker .
```

## Architecture

```
jules new → Task JSON → Docker Container → OpenCode → GitHub PR
                              ↓
                        Webhook Server ← GitHub Events (merged/closed/CI)
                              ↓
                        Auto-fix CI (optional)
```

## Webhook Server Setup

The webhook server needs to be reachable from GitHub. Since our server is behind a firewall, we use a **cloudflared tunnel** to expose it.

### How it works

```
GitHub → Cloudflare Edge → cloudflared tunnel → localhost:3456 → jules webhook
```

1. `cloudflared` creates a secure tunnel from Cloudflare's edge to your local port
2. You get a public URL (e.g., `https://random-words.trycloudflare.com`)
3. GitHub webhook sends events to this URL
4. Events flow through the tunnel to the local webhook server

### Quick tunnel (temporary)

Good for testing. URL changes each restart.

```bash
# Install cloudflared (if needed)
curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3456

# Note the URL it prints (e.g., https://foo-bar-baz.trycloudflare.com)
```

### Full setup script

```bash
# 1. Generate webhook secret
export JULES_WEBHOOK_SECRET=$(openssl rand -hex 20)
echo "Secret: $JULES_WEBHOOK_SECRET"

# 2. Start webhook server
cd /root/repos/jules-clone
export GITHUB_TOKEN=$(gh auth token)
nohup node dist/index.js webhook --port 3456 --auto-fix-ci --auto-fix-reviews > /tmp/jules-webhook.log 2>&1 &

# 3. Start cloudflared tunnel
cloudflared tunnel --url http://localhost:3456 > /tmp/cloudflared.log 2>&1 &
sleep 5
TUNNEL_URL=$(grep -o 'https://[^|]*trycloudflare.com' /tmp/cloudflared.log | head -1)
echo "Tunnel URL: $TUNNEL_URL"

# 4. Create GitHub webhook (replace owner/repo)
gh api repos/OWNER/REPO/hooks --method POST --input - <<EOF
{
  "name": "web",
  "config": {
    "url": "${TUNNEL_URL}/webhook",
    "content_type": "json",
    "secret": "$JULES_WEBHOOK_SECRET"
  },
  "events": ["pull_request", "issue_comment", "check_run", "pull_request_review", "pull_request_review_comment"],
  "active": true
}
EOF
```

### Persistent tunnel (production)

For a stable URL that survives restarts, create a named tunnel with a Cloudflare account:

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create named tunnel
cloudflared tunnel create jules-webhook

# Route to a subdomain (requires DNS setup in Cloudflare dashboard)
cloudflared tunnel route dns jules-webhook jules-webhook.yourdomain.com

# Run with config
cat > ~/.cloudflared/config.yml <<EOF
tunnel: jules-webhook
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: jules-webhook.yourdomain.com
    service: http://localhost:3456
  - service: http_status:404
EOF

cloudflared tunnel run jules-webhook
```

### Current setup (PrivaSpeech)

- **Webhook ID:** 591388697
- **Tunnel type:** Quick tunnel (temporary URL)
- **Events:** pull_request, issue_comment, check_run, pull_request_review, pull_request_review_comment
- **Auto-fix:** CI failures + bot reviews (greptile-apps[bot])

### Checking webhook deliveries

```bash
# List recent deliveries
gh api repos/OWNER/REPO/hooks/HOOK_ID/deliveries --jq '.[] | {id, event, status_code}'

# Redeliver a failed one
gh api repos/OWNER/REPO/hooks/HOOK_ID/deliveries/DELIVERY_ID/attempts --method POST
```

### Note on Greptile

Greptile does **not** automatically re-review after pushes. The auto-fix loop works for:
- Initial Greptile review → jules fixes
- CI failures → jules fixes

But won't create an infinite loop since Greptile only reviews once per PR (unless manually requested).

## Notes

- Tasks run in isolated Docker containers
- Each task gets its own branch (`jules/<task-id>`)
- Follow-ups continue on the same branch
- Webhook server tracks PR lifecycle (merged, closed, CI status)
- Auto-fix CI creates follow-up tasks when checks fail
