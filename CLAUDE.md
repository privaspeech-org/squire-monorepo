# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (turbo)
pnpm test             # Run all tests
pnpm dev              # Watch mode for development

# Run a single package's tests
node --import tsx --test packages/core/src/**/*.test.ts
node --import tsx --test packages/cli/src/**/*.test.ts
node --import tsx --test 'packages/steward/src/**/*.test.ts' 'packages/steward/src/*.test.ts'

# Run CLIs (after build)
pnpm squire <command>   # Run squire CLI
pnpm steward <command>  # Run steward CLI
```

## Architecture

This monorepo contains tools for autonomous coding agents:

```
Goals + Signals → Steward → Tasks → Squire → PRs
```

### Packages

| Package | Description |
|---------|-------------|
| `@squire/core` | Shared task management, container orchestration, logging |
| `@squire/cli` | Squire CLI - executes individual coding tasks in containers |
| `@squire/steward` | Steward CLI - orchestrates tasks from goals and GitHub signals |
| `apps/worker` | Docker image with coding agent (Node 24, git, gh CLI, pnpm, OpenCode) |

### Data Flow

1. **Steward** collects signals from GitHub (failed CI, open PRs, issues) and file-based task queues
2. **Steward** uses an LLM to generate task prompts from goals + signals
3. **Squire** dispatches tasks by starting worker containers via `@squire/core`
4. **Worker** clones repo, runs OpenCode agent, commits changes, creates PR
5. Task state is persisted as JSON files in `~/.squire/tasks/`

### Key Design Patterns

- **Repo from config, not LLM** - `default_repo` comes from steward.yaml, LLM only generates prompts
- **Pluggable backends** - Worker execution via Docker (local) or Kubernetes (production)
- **Podman-first** - Docker backend auto-detects Podman socket before Docker
- **Programmatic API** - Steward uses `@squire/core` directly, not CLI subprocess
- **File-based task queue** - Manual tasks via markdown files in `signals/`

### Core Module Exports (`@squire/core`)

Task management: `createTask`, `getTask`, `updateTask`, `listTasks`, `deleteTask`
Backend management: `getBackend`, `createBackend`, `setBackend` (async, lazy-loaded)
Container management: `startTaskContainer`, `getContainerLogs`, `isContainerRunning`, `stopContainer`
Concurrency: `countRunningTasks`, `canStartNewTask`, `waitForSlot`
Logging: `createLogger`, `setLogLevel`, `setVerbose`, `setQuiet`

### Worker Backend System

The `@squire/core` package provides a pluggable backend system for running workers:

| Backend | Use Case | Implementation |
|---------|----------|----------------|
| `docker` | Local development | Spawns containers via Docker/Podman socket |
| `kubernetes` | Production | Creates K8s Jobs with shared PVC for task state |

Backend selection (in order of precedence):
1. `SQUIRE_BACKEND` environment variable (`docker`, `kubernetes`, `k8s`, `podman`)
2. Auto-detect: uses `kubernetes` if `KUBERNETES_SERVICE_HOST` is set (in-cluster)
3. Default: `docker`

```typescript
// Backends are lazy-loaded to avoid bundling native dependencies
const backend = await getBackend();
await backend.startTask({ task, githubToken, model });
```

### Task Type

```typescript
interface Task {
  id: string;
  repo: string;
  prompt: string;
  branch: string;
  baseBranch: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  containerId?: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}
```

## Configuration Files

- `squire.config.json` - Squire configuration (githubToken, model, workerImage, maxConcurrent)
- `steward.yaml` - Steward configuration (goals, signals, execution backend, LLM model)
- `.env` - API keys (AI_GATEWAY_API_KEY for Steward's LLM)

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `SQUIRE_BACKEND` | Worker backend (`docker` or `kubernetes`) | Auto-detect |
| `SQUIRE_NAMESPACE` | K8s namespace for Jobs | `squire` |
| `SQUIRE_TASKS_DIR` | Task JSON storage path | `~/.squire/tasks` |
| `SQUIRE_WORKER_IMAGE` | Worker container image | `squire-worker:latest` |
| `GITHUB_TOKEN` | GitHub API authentication | - |
| `AI_GATEWAY_API_KEY` | LLM API key for Steward | - |

## Building Docker Images

```bash
# Worker image (coding agent with OpenCode)
podman build -t squire-worker:latest apps/worker/

# Web dashboard
podman build -t squire-web:latest -f deploy/docker/web.Dockerfile .

# Steward orchestrator
podman build -t squire-steward:latest -f deploy/docker/steward.Dockerfile .
```

## Kubernetes Deployment

The `deploy/` directory contains Kubernetes manifests using Kustomize:

```
deploy/
├── docker/           # Dockerfiles for web and steward
├── base/             # Base K8s manifests
│   ├── namespace.yaml
│   ├── rbac.yaml     # ServiceAccounts and Roles for Job management
│   ├── pvc/          # Shared storage for task state
│   ├── configmaps/   # Steward configuration
│   ├── secrets/      # Templates (create manually)
│   ├── steward/      # Steward Deployment
│   └── web/          # Web Deployment, Service, Ingress
└── overlays/
    ├── dev/          # Local development (kind/minikube)
    └── prod/         # Production settings
```

### Deploy to Local Cluster (kind)

```bash
# Create cluster
KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster --name squire-test

# Load images
podman save squire-worker:latest | KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /dev/stdin --name squire-test
podman save squire-web:latest | KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /dev/stdin --name squire-test
podman save squire-steward:latest | KIND_EXPERIMENTAL_PROVIDER=podman kind load image-archive /dev/stdin --name squire-test

# Create secrets
kubectl create secret generic squire-github-token --from-literal=token=$GITHUB_TOKEN -n squire-dev
kubectl create secret generic squire-llm-api-key --from-literal=key=$AI_GATEWAY_API_KEY -n squire-dev

# Deploy
kubectl apply -k deploy/overlays/dev

# Port-forward to test
kubectl port-forward svc/dev-squire-web 3000:80 -n squire-dev
```

### Deploy to Production

```bash
# Create secrets first (or use external-secrets/sealed-secrets)
kubectl create secret generic squire-github-token --from-literal=token=$GITHUB_TOKEN -n squire
kubectl create secret generic squire-llm-api-key --from-literal=key=$AI_GATEWAY_API_KEY -n squire

# Deploy with production overlay
kubectl apply -k deploy/overlays/prod
```

### CI/CD Workflows

- `.github/workflows/docker.yml` - Builds and pushes images to ghcr.io on push to main/tags
- `.github/workflows/deploy.yml` - Manual/auto deployment via kustomize
