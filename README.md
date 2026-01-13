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

### `jules new <repo> "<prompt>"`

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

### `jules list`

List all tasks.

```bash
jules list
jules list --status running
jules list -n 20
```

### `jules status <id>`

Get detailed status of a task.

### `jules logs <id>`

View container logs for a task.

```bash
jules logs abc123
jules logs abc123 --tail 200
```

### `jules start <id>`

Start a pending task (created with `--no-start`).

### `jules stop <id>`

Stop a running task.

### `jules clean`

Clean up completed/failed tasks.

```bash
jules clean              # Remove completed/failed tasks
jules clean --all        # Remove all tasks
jules clean --containers # Also remove stopped containers
jules clean --dry-run    # Preview what would be removed
```

### `jules config`

View or set configuration.

```bash
jules config                    # Show all config
jules config --list             # Same as above
jules config githubToken        # Get a value
jules config model gpt-4        # Set a value
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
  "workerImage": "jules-worker:latest"
}
```

Environment variables:
- `GITHUB_TOKEN` — GitHub token for cloning and PRs
- `GH_TOKEN` — Alternative GitHub token variable
- `JULES_MODEL` — Default model
- `JULES_TASKS_DIR` — Where to store task files
- `JULES_WORKER_IMAGE` — Docker image for workers

## How it Works

1. **Task Created** — JSON file stored in `tasks/`
2. **Container Started** — Docker container spins up with OpenCode
3. **Work Happens** — Container clones repo, runs OpenCode, commits changes
4. **PR Created** — GitHub PR opened automatically
5. **Done** — Task marked complete, container exits

Each task runs in isolation. You can have multiple tasks running in parallel.

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
PENDING ──────► RUNNING ──────► COMPLETED
                   │                 
                   ▼                 
                FAILED ◄───── (on error)
```

## Development

```bash
npm run dev    # Watch mode
npm run build  # Build once
```

### Testing

```bash
# Run a test task
jules new carlulsoe/jules-clone "Add a test file" --base master

# Check progress
jules status <id>
jules logs <id>
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│      CLI        │────►│  Task Store  │────►│   Docker    │
│  jules new/...  │     │  (JSON files)│     │  Container  │
└─────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                                                    ▼
                                             ┌─────────────┐
                                             │  OpenCode   │
                                             │  + gh CLI   │
                                             └─────────────┘
                                                    │
                                                    ▼
                                             ┌─────────────┐
                                             │  GitHub PR  │
                                             └─────────────┘
```

## License

MIT
