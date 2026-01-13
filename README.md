# Jules Clone

Async coding agent — fire and forget, come back to a PR.

## What is this?

Jules Clone is a local implementation inspired by Google's Jules: you give it a task and a repo, it works autonomously in a Docker container using OpenCode, and creates a PR when done. No babysitting required.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Build the worker container
docker build -t jules-worker .

# Set your GitHub token
export GITHUB_TOKEN=ghp_xxxxx
# Or save it permanently:
jules config githubToken ghp_xxxxx

# Create a task
jules new owner/repo "Add a health check endpoint"

# Check status
jules status <task-id>

# View logs
jules logs <task-id>
```

## Commands

### Core Commands

#### `jules new <repo> "<prompt>"`

Create and start a new coding task.

```bash
jules new carlulsoe/my-app "Add dark mode support"
jules new carlulsoe/my-app "Fix the login bug" --base develop
jules new carlulsoe/my-app "Refactor auth" --branch feature/auth-refactor
jules new carlulsoe/my-app "Add tests" --no-start  # Create but don't start
```

Options:
- `-b, --branch <name>` — Custom branch name (default: `jules/<id>`)
- `--base <branch>` — Base branch (default: auto-detect from repo)
- `-m, --model <model>` — Model to use (default: `opencode/glm-4.7-free`)
- `--no-start` — Create task without starting it

#### `jules list`

List all tasks.

```bash
jules list
jules list --status running
jules list -n 20
```

#### `jules status <id>`

Get detailed status of a task.

#### `jules logs <id>`

View container logs for a task.

```bash
jules logs abc123
jules logs abc123 --tail 200
```

### Task Management

#### `jules start <id>`

Start a pending task (created with `--no-start` or queued due to limits).

#### `jules stop <id>`

Stop a running task.

#### `jules retry <id>`

Retry a failed task.

```bash
jules retry abc123
jules retry abc123 --model anthropic/claude-sonnet-4  # Try with better model
jules retry abc123 --new-branch  # Start fresh on new branch
```

#### `jules followup <id> "<prompt>"` (alias: `fu`)

Send follow-up instructions to a completed task.

```bash
jules followup abc123 "Also add tests for the new feature"
jules fu abc123 "Fix the typo in the docs"
```

The follow-up:
- Uses the same branch (continues from where it left off)
- If a PR exists, adds a comment instead of creating a new PR
- Creates a new task linked to the parent

### Monitoring

#### `jules ps`

Show running tasks (like `docker ps`).

```bash
jules ps        # Show running/pending tasks
jules ps -a     # Show all tasks
```

#### `jules watch`

Watch tasks and auto-start queued ones.

```bash
jules watch                    # Watch with default 10s interval
jules watch -i 5               # Poll every 5 seconds
jules watch --no-auto-start    # Don't auto-start pending tasks
jules watch --once             # Check once and exit
```

#### `jules webhook`

Start a webhook server to receive GitHub events (PR merged/closed/commented).

```bash
jules webhook                           # Start on port 3000
jules webhook -p 8080                   # Custom port
jules webhook -s "your-webhook-secret"  # With signature verification
```

Then configure your GitHub repo:
1. Settings → Webhooks → Add webhook
2. Payload URL: `http://your-host:3000/webhook`
3. Content type: `application/json`
4. Secret: (same as --secret flag)
5. Events: Pull requests, Issue comments

### Maintenance

#### `jules clean`

Clean up completed/failed tasks.

```bash
jules clean              # Remove completed/failed tasks
jules clean --all        # Remove all tasks
jules clean --containers # Also remove stopped containers
jules clean --dry-run    # Preview what would be removed
```

#### `jules config`

View or set configuration.

```bash
jules config                    # Show all config
jules config --list             # Same as above
jules config githubToken        # Get a value
jules config model gpt-4        # Set a value
jules config maxConcurrent 3    # Limit parallel tasks
jules config --path             # Show config file location
```

## Configuration

Jules looks for config in:
1. Environment variables
2. `./jules.config.json`
3. `~/.jules/config.json`
4. `~/.config/jules/config.json`

Example config:
```json
{
  "githubToken": "ghp_xxxxx",
  "model": "opencode/glm-4.7-free",
  "workerImage": "jules-worker:latest",
  "maxConcurrent": 5
}
```

Environment variables:
- `GITHUB_TOKEN` — GitHub token for cloning and PRs
- `GH_TOKEN` — Alternative GitHub token variable
- `JULES_MODEL` — Default model
- `JULES_TASKS_DIR` — Where to store task files
- `JULES_WORKER_IMAGE` — Docker image for workers
- `JULES_MAX_CONCURRENT` — Max parallel tasks (default: 5)
- `JULES_WEBHOOK_SECRET` — Secret for webhook signature verification

## Parallel Task Limits

By default, Jules allows 5 concurrent tasks. When the limit is reached:
- New tasks are created but not started automatically
- Use `jules watch` to auto-start when slots open
- Or manually start with `jules start <id>`

```bash
# Set a lower limit
jules config maxConcurrent 3

# Watch will auto-start queued tasks as slots open
jules watch
```

## Models

Default is `opencode/glm-4.7-free` (free tier). Other options:

| Model | Cost | Notes |
|-------|------|-------|
| `opencode/glm-4.7-free` | Free | Default, good for simple tasks |
| `opencode/minimax-m2.1-free` | Free | Alternative free model |
| `anthropic/claude-sonnet-4` | Paid | Better for complex tasks |
| `openai/gpt-4.1` | Paid | OpenAI alternative |

## Task Lifecycle

```
PENDING ──────► RUNNING ──────► COMPLETED ──────► (PR Merged)
    │              │                 │
    │              ▼                 ▼
    │           FAILED          (PR Closed)
    │              │
    │              ▼
    └───────► (retry) ────► RUNNING
```

## Development

```bash
npm run dev    # Watch mode
npm run build  # Build once
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│      CLI        │────►│  Task Store  │────►│   Docker    │
│  jules new/...  │     │  (JSON files)│     │  Container  │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │                    │
                               ▼                    ▼
                        ┌──────────────┐     ┌─────────────┐
                        │   Webhook    │◄────│  OpenCode   │
                        │   Server     │     │  + gh CLI   │
                        └──────────────┘     └─────────────┘
                               │                    │
                               ▼                    ▼
                        ┌──────────────┐     ┌─────────────┐
                        │   GitHub     │◄────│  GitHub PR  │
                        │   Events     │     └─────────────┘
                        └──────────────┘
```

## License

MIT
