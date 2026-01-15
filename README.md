# Steward 🏰

Task orchestrator that turns goals into coding tasks. Works with [Squire](https://github.com/privaspeech-org/squire) to automate software development.

## Philosophy

**Steward** generates tasks. **Squire** executes them.

```
Goal + Context + Signals → Steward → Tasks → Squire → PRs
```

Steward is a pipeline, not a chatbot. It uses LLMs narrowly for task generation, not for tool use or conversation.

## Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. COLLECT        Gather signals from configured sources   │
│     (deterministic)   - GitHub: PRs, issues, CI status      │
│                       - Analytics: PostHog events           │
│                       - Custom: webhooks, files             │
├─────────────────────────────────────────────────────────────┤
│  2. ANALYZE        Compare signals against goals            │
│     (LLM)             - What's the current state?           │
│                       - What tasks would move us forward?   │
│                       - Priority and dependencies?          │
├─────────────────────────────────────────────────────────────┤
│  3. DISPATCH       Send tasks to Squire                     │
│     (deterministic)   - Create task with prompt             │
│                       - Track task ID                       │
│                       - Respect concurrency limits          │
├─────────────────────────────────────────────────────────────┤
│  4. MONITOR        Track task completion                    │
│     (deterministic)   - Poll Squire status                  │
│                       - Check PR state                      │
│                       - Handle failures                     │
├─────────────────────────────────────────────────────────────┤
│  5. REPORT         Notify human of progress                 │
│     (deterministic)   - Telegram/Slack/Discord              │
│                       - Daily summaries                     │
│                       - Escalate blockers                   │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Multi-Source Signal Collection** - Gather signals from GitHub (PRs, issues, CI), PostHog events, webhooks, and custom files
- **LLM-Powered Task Analysis** - Compare signals against goals to generate prioritized tasks with dependencies
- **Squire Integration** - Dispatch tasks to Squire for automated code generation and PR creation
- **Concurrency Control** - Configure maximum concurrent task execution to manage resources
- **Multi-Channel Notifications** - Get updates via Telegram, Slack, or Discord with daily summaries and escalation alerts
- **Flexible Scheduling** - Run on intervals with configurable quiet hours and timezone support
- **Dry Run Mode** - Preview what tasks would be dispatched without executing them
- **Watch Mode** - Continuous operation with automatic polling at configurable intervals
- **Vercel AI Gateway** - LLM integration with support for multiple providers (OpenAI, Anthropic, etc.)
- **Deterministic Pipeline** - Only uses LLM for task analysis; everything else is predictable and debuggable

## Quick Start

```bash
# Install
git clone https://github.com/privaspeech-org/steward
cd steward && npm install && npm link

# Initialize workspace
steward init

# Run once (collect → analyze → dispatch)
steward run

# Watch mode (continuous loop)
steward watch --interval 30m

# Dry run (show what would be dispatched)
steward run --dry-run
```

## Configuration

### steward.yaml

```yaml
# What we're trying to achieve
goals:
  - path: ./goals.md

# Where to get signals
signals:
  github:
    repos:
      - privaspeech-org/privaspeech
    watch:
      - open_prs
      - failed_ci
      - issues
   
  posthog:
    project: privaspeech
    events:
      - transcription_error
   
  files:
    - ./signals/tasks.md

# How to execute tasks
execution:
  backend: squire
  squire:
    default_repo: privaspeech-org/privaspeech
    model: opencode/minimax-m2.1-free
    max_concurrent: 3

# Where to send notifications  
notify:
  telegram:
    chat_id: "123456"

# LLM for task generation (narrow use) - uses Vercel AI Gateway
llm:
  model: openai/gpt-4o-mini

# Behavior
schedule:
  interval: 30m
  quiet_hours: "22:00-08:00"
  timezone: Europe/Copenhagen
```

### Environment Variables

```bash
export AI_GATEWAY_API_KEY=your_key
```

The AI Gateway uses the `AI_GATEWAY_API_KEY` environment variable for authentication. Model format should be `provider/model-name` (e.g., `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`).

## Commands

| Command | Description |
|---------|-------------|
| `steward init` | Initialize workspace with config |
| `steward run` | Run one cycle of the pipeline |
| `steward watch` | Continuous mode with interval |
| `steward status` | Show current state |
| `steward signals` | List collected signals |
| `steward tasks` | List active/pending tasks |

## Architecture

```
src/
├── index.ts          # CLI entry point
├── config.ts         # Load steward.yaml
├── pipeline/
│   ├── collect.ts    # Signal collection
│   ├── analyze.ts    # LLM task generation
│   ├── dispatch.ts   # Send to Squire
│   ├── monitor.ts    # Track completion
│   └── report.ts     # Notifications
├── signals/
│   ├── github.ts     # GitHub signal source
│   ├── posthog.ts    # PostHog signal source
│   └── files.ts      # File-based signals
└── notify/
    ├── telegram.ts   # Telegram notifications
    └── slack.ts      # Slack notifications
```

## Why a Pipeline, Not a Chatbot?

We tried running Steward as a Clawdbot instance, but it required a model good at everything: conversation, context, tools, decisions. Too much.

Steward as a pipeline:
- Uses LLM **only** for task analysis ✅
- Everything else is deterministic ✅
- Easier to debug and reason about ✅
- Works with cheaper/smaller models ✅

## License

MIT
