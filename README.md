---
name: squire
description: Your trusty squire for background coding tasks - fire and forget, come back to a PR.
---

# Squire 🛡️

Async coding agent that works autonomously in Docker containers using OpenCode. Fire and forget, come back to a PR.

## Location

- **Repo:** https://github.com/carlulsoe/squire
- **Local:** `/root/repos/squire`
- **CLI:** `squire` (after npm link)

## Quick Start

```bash
cd /root/repos/squire
export GITHUB_TOKEN=$(gh auth token)

# Create a task
squire new owner/repo "Add feature X"

# Check status
squire status <task-id>

# View logs
squire logs <task-id>
```

## Commands

### Core

| Command | Description |
|---------|-------------|
| `squire new <repo> "<prompt>"` | Create and start a coding task |
| `squire list` | List all tasks |
| `squire status <id>` | Get task details |
| `squire logs <id>` | View container logs |

### Task Management

| Command | Description |
|---------|-------------|
| `squire start <id>` | Start a pending task |
| `squire stop <id>` | Stop a running task |
| `squire retry <id>` | Retry a failed task |
| `squire followup <id> "<prompt>"` | Continue work on same branch |

### Monitoring

| Command | Description |
|---------|-------------|
| `squire ps` | Show running tasks |
| `squire watch` | Watch + auto-start queued tasks |
| `squire webhook` | Start webhook server for GitHub events |

### Maintenance

| Command | Description |
|---------|-------------|
| `squire clean` | Remove completed/failed tasks |
| `squire config` | View/set configuration |

## Workflow Examples

### Simple task
```bash
squire new privaspeech-org/privaspeech "Add a health check endpoint to the API"
# Wait for completion...
squire status <id>
# PR created automatically!
```

### Follow-up on completed task
```bash
squire followup <id> "Also add tests for the health check"
# Continues on same branch, comments on existing PR
```

### Retry with better model
```bash
squire retry <id> --model anthropic/claude-sonnet-4
```

### CI failure auto-fix
```bash
# Start webhook server with auto-fix enabled
squire webhook --auto-fix-ci

# When CI fails, automatically creates follow-up task to fix it
```

### Greptile/bot review auto-fix
```bash
# Start webhook server with review auto-fix
squire webhook --auto-fix-reviews

# When Greptile (or other bots) post review comments, 
# automatically creates follow-up task to address them

# Custom bot list (comma-separated)
squire webhook --auto-fix-reviews --review-bots "greptile[bot],coderabbit[bot]"

# Combine with CI auto-fix for full automation
squire webhook --auto-fix-ci --auto-fix-reviews
```

### Parallel tasks with limits
```bash
squire config maxConcurrent 3  # Limit to 3 parallel tasks
squire new repo1 "Task 1"
squire new repo2 "Task 2"
squire new repo3 "Task 3"
squire new repo4 "Task 4"  # Queued, waiting for slot

# Watch will auto-start queued tasks
squire watch
```

## Configuration

Set GitHub token:
```bash
export GITHUB_TOKEN=$(gh auth token)
# Or persist:
squire config githubToken $(gh auth token)
```

Set model:
```bash
squire config model opencode/glm-4.7-free  # Free (default)
squire config model anthropic/claude-sonnet-4  # Better but paid
```

Set parallel limit:
```bash
squire config maxConcurrent 5
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
cd /root/repos/squire
docker build -t squire-worker .
```

## Architecture

```
squire new → Task JSON → Docker Container → OpenCode → GitHub PR
                              ↓
                        Webhook Server ← GitHub Events (merged/closed/CI)
                              ↓
                        Auto-fix CI (optional)
```

## Webhook Server Setup

The webhook server needs to be reachable from GitHub. Since our server is behind a firewall, we use a **cloudflared tunnel** to expose it.

### How it works

```
GitHub → Cloudflare Edge → cloudflared tunnel → localhost:3456 → squire webhook
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
export SQUIRE_WEBHOOK_SECRET=$(openssl rand -hex 20)
echo "Secret: $SQUIRE_WEBHOOK_SECRET"

# 2. Start webhook server
cd /root/repos/squire
export GITHUB_TOKEN=$(gh auth token)
nohup node dist/index.js webhook --port 3456 --auto-fix-ci --auto-fix-reviews > /tmp/squire-webhook.log 2>&1 &

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
    "secret": "$SQUIRE_WEBHOOK_SECRET"
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
cloudflared tunnel create squire-webhook

# Route to a subdomain (requires DNS setup in Cloudflare dashboard)
cloudflared tunnel route dns squire-webhook squire-webhook.yourdomain.com

# Run with config
cat > ~/.cloudflared/config.yml <<EOF
tunnel: squire-webhook
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: squire-webhook.yourdomain.com
    service: http://localhost:3456
  - service: http_status:404
EOF

cloudflared tunnel run squire-webhook
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
- Initial Greptile review → squire fixes
- CI failures → squire fixes

But won't create an infinite loop since Greptile only reviews once per PR (unless manually requested).

## Why "Squire"?

A squire is an apprentice to a knight - they do the groundwork, handle the prep work, and learn as they go. Perfect for an AI coding assistant using cheaper models to handle routine tasks while you focus on the important stuff. 🛡️

## Notes

- Tasks run in isolated Docker containers
- Each task gets its own branch (`squire/<task-id>`)
- Follow-ups continue on the same branch
- Webhook server tracks PR lifecycle (merged, closed, CI status)
- Auto-fix CI creates follow-up tasks when checks fail
