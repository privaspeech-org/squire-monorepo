# Jules Clone

Async coding agent — fire and forget, come back to a PR.

## What is this?

Jules Clone is a local implementation of Google's Jules: you give it a task and a repo, it works autonomously in a container, and creates a PR when done. No babysitting required.

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
```

Options:
- `-b, --branch <name>` — Custom branch name (default: `jules/<id>`)
- `--base <branch>` — Base branch (default: `main`)
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

## Configuration

Jules looks for config in:
1. `./jules.config.json`
2. `~/.jules/config.json`
3. `~/.config/jules/config.json`

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
- `opencode/minimax-m2.1-free` — Another free option
- `anthropic/claude-sonnet-4` — Better but costs $$$

## Development

```bash
npm run dev    # Watch mode
npm run build  # Build once
```

## License

MIT
