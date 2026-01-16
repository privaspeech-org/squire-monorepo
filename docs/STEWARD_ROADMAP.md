# Steward Roadmap

Ideas for making Steward a best-in-class async coding agent orchestrator.

## Current State

Steward collects signals (GitHub issues, CI failures, PRs) and goals, uses an LLM to generate tasks, and dispatches them to Squire workers. Tasks now include enhanced specs (context, acceptance criteria, implementation hints, verification).

## Short-Term Improvements

### 1. Repo Context Gathering

**Problem:** Steward generates tasks without deep knowledge of the target repo's structure, patterns, or conventions.

**Solution:** Before generating tasks, analyze the repo:

```typescript
interface RepoContext {
  // Structure
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  monorepo: boolean;
  packages?: string[];
  
  // Available scripts
  scripts: {
    test?: string;
    lint?: string;
    build?: string;
    typecheck?: string;
  };
  
  // Patterns detected
  patterns: {
    testFramework?: 'jest' | 'vitest' | 'mocha' | 'playwright';
    errorHandling?: string;  // e.g., "Custom error classes in src/errors/"
    logging?: string;        // e.g., "Uses pino logger"
  };
  
  // Key files
  keyFiles: {
    contributing?: string;
    architecture?: string;
    changelog?: string;
  };
}
```

**Implementation:**
- Add `collectRepoContext(repo: string)` function
- Cache context per repo (invalidate on new commits)
- Include relevant context in task generation prompt

---

### 2. Smart Task Sizing

**Problem:** Big goals get turned into big tasks that are hard for agents to complete.

**Solution:** Automatically break down large tasks:

```typescript
interface TaskSizingConfig {
  maxFilesPerTask: number;      // Default: 5
  maxLinesChanged: number;      // Default: 500
  preferAtomicChanges: boolean; // Default: true
}
```

**Heuristics:**
- If goal mentions multiple features → split into separate tasks
- If estimated change is large → break into phases with depends_on
- If goal is vague → create an "analysis task" first that outputs specific sub-tasks

**Example:**
```
Goal: "Implement user authentication"

Generated tasks:
1. [Analysis] Review codebase, propose auth implementation plan
2. [depends_on: 1] Add auth types and interfaces
3. [depends_on: 2] Implement JWT token generation
4. [depends_on: 2] Add login endpoint
5. [depends_on: 3,4] Add auth middleware
6. [depends_on: 5] Add tests for auth flow
```

---

### 3. Failure Analysis & Learning

**Problem:** When tasks fail, we don't learn why or improve future specs.

**Solution:** Analyze failures and feed back into task generation:

```typescript
interface FailureAnalysis {
  taskId: string;
  failureType: 'build' | 'test' | 'lint' | 'timeout' | 'agent_stuck' | 'unclear_spec';
  rootCause?: string;
  specImprovements?: string[];  // What was missing from the spec
}

// Store failure patterns
interface FailurePattern {
  pattern: string;           // e.g., "Missing null check"
  frequency: number;
  suggestedPrevention: string;
}
```

**Implementation:**
- After task failure, analyze logs to categorize failure
- Track common failure patterns per repo
- Include "lessons learned" in future task prompts:
  ```
  ## LESSONS FROM PAST FAILURES
  - Tasks in this repo often fail due to missing type imports
  - Always run `pnpm typecheck` before submitting
  ```

---

### 4. PR Review Feedback Loop

**Problem:** We don't learn from PR review comments to improve future tasks.

**Solution:** Parse PR reviews and extract improvement signals:

```typescript
interface ReviewFeedback {
  prNumber: number;
  taskId: string;
  comments: Array<{
    file: string;
    line: number;
    comment: string;
    type: 'style' | 'bug' | 'improvement' | 'question';
  }>;
  outcome: 'merged' | 'closed' | 'changes_requested';
}
```

**Use feedback to:**
- Update repo-specific patterns ("Reviewer always asks for X")
- Improve task templates ("Include Y in acceptance criteria")
- Identify knowledge gaps ("Agent doesn't understand Z pattern")

---

### 5. Confidence Scoring

**Problem:** All tasks are treated equally, but some specs are better than others.

**Solution:** Score task spec completeness:

```typescript
interface TaskConfidence {
  score: number;  // 0-100
  factors: {
    hasContext: boolean;
    hasAcceptanceCriteria: boolean;
    hasImplementationHints: boolean;
    hasVerification: boolean;
    repoContextAvailable: boolean;
    similarTaskSucceeded: boolean;
  };
  recommendation: 'dispatch' | 'needs_enrichment' | 'needs_human_review';
}
```

**Actions based on score:**
- High confidence (80+): Dispatch immediately
- Medium confidence (50-80): Dispatch but monitor closely
- Low confidence (<50): Flag for human review or auto-enrich

---

## Medium-Term Improvements

### 6. Multi-Agent Coordination

**Problem:** Tasks that depend on each other may conflict or duplicate work.

**Solution:** Coordinate between concurrent agents:

- Lock files being modified to prevent conflicts
- Share context between related tasks
- Detect when two tasks are solving the same problem

### 7. Continuous Refinement Mode

**Problem:** Sometimes a task needs multiple iterations to get right.

**Solution:** Allow tasks to spawn follow-up tasks:

```typescript
interface TaskResult {
  status: 'completed' | 'partial' | 'blocked';
  prUrl?: string;
  followUpTasks?: Task[];  // Agent-suggested next steps
  blockers?: string[];     // What's preventing completion
}
```

### 8. Human-in-the-Loop Escalation

**Problem:** Some tasks genuinely need human input.

**Solution:** Smart escalation:

- If agent is stuck for >N minutes, notify human
- If confidence is low, request spec review before dispatch
- If PR has conflicts, ask human to resolve

### 9. Cost Optimization

**Problem:** Running many agents can be expensive.

**Solution:** Smart scheduling:

- Batch similar tasks to same agent session
- Use cheaper models for simple tasks (docs, formatting)
- Cache common operations (repo cloning, dependency install)

---

## Long-Term Vision

### 10. Self-Improving Prompts

Use ML to optimize task prompts based on outcomes:
- A/B test different prompt structures
- Learn which context is most valuable
- Automatically tune prompt length/detail

### 11. Codebase Embedding

Maintain vector embeddings of the codebase:
- Find relevant code for context automatically
- Detect similar past changes for reference
- Understand code relationships

### 12. Integration Ecosystem

- **Slack/Discord:** Get approval, receive updates
- **Linear/Jira:** Sync with issue trackers
- **Observability:** Track agent performance metrics
- **Custom signals:** Webhooks for any event source

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Repo Context Gathering | Medium | High |
| P0 | Failure Analysis | Medium | High |
| P1 | Smart Task Sizing | Medium | High |
| P1 | Confidence Scoring | Low | Medium |
| P1 | PR Review Feedback | Medium | Medium |
| P2 | Multi-Agent Coordination | High | Medium |
| P2 | Human Escalation | Medium | Medium |
| P3 | Self-Improving Prompts | High | High |
| P3 | Codebase Embedding | High | High |

---

## Next Steps

1. Implement repo context gathering (P0)
2. Add failure categorization to task store
3. Build confidence scoring into dispatch pipeline
4. Add Slack/Discord notifications for low-confidence tasks

---

## Deeper Thinking: What Could Steward Become?

### The Tech Lead Mental Model

Think of Steward as a **tech lead** managing a team of junior developers (Squire workers). What makes a great tech lead?

1. **Context is King** — They don't just say "fix the bug." They explain the history, the constraints, what was tried before, who cares about this, and why it matters.

2. **Right Task, Right Person** — They match task complexity to capability. Simple formatting? Junior dev. Complex refactor? Senior dev or pair programming. Steward should route tasks to appropriate models/configurations.

3. **Anticipate Questions** — A good tech lead answers questions before they're asked. "You'll probably wonder about X — here's why we do it that way." Steward's specs should preempt confusion.

4. **Review With Purpose** — They don't just approve/reject. They teach. Steward should extract lessons from every PR review and feed them forward.

5. **Shield From Noise** — They filter signals so the team focuses on what matters. Steward should prioritize ruthlessly, not just pass through every issue.

### The Specification Bug Hypothesis

The article's key insight: **failures are specification bugs, not agent bugs.**

What if Steward could close the loop automatically?

```
Task fails → Analyze why → Identify spec gap → Rewrite spec → Retry
```

Example:
- Task: "Add logging to user service"
- Failure: Build error, missing import
- Analysis: Spec didn't mention the logging library to use
- Rewritten spec: "Add logging using pino (already in dependencies) to user service..."
- Retry with enriched spec

This turns Steward into a **self-healing system** that gets better with each failure.

### Proactive vs Reactive

Current Steward: Waits for signals (CI fails, issue opened, PR needs review).

Future Steward: **Proactively improves the codebase.**

Ideas:
- **Dependency Freshness** — "lodash is 3 major versions behind, security advisory exists" → task to upgrade
- **Test Coverage Gaps** — "src/auth/ has 20% coverage, rest of codebase is 80%" → task to add tests
- **Code Health Metrics** — "This file has 15 functions over 50 lines" → task to refactor
- **Documentation Drift** — "README mentions API v1, code is on v3" → task to update docs
- **Dead Code** — "This function has no callers" → task to remove or investigate

Steward becomes a **continuous improvement engine**, not just a task dispatcher.

### Speculative Execution

For hard problems, don't bet on one approach:

```typescript
interface SpeculativeTask {
  goal: string;
  approaches: Array<{
    strategy: string;
    task: Task;
  }>;
  selection: 'first_success' | 'best_result' | 'human_choice';
}
```

Example: "Improve API response time"
- Approach A: Add caching layer
- Approach B: Optimize database queries
- Approach C: Add pagination

Run all three in parallel, take the first that succeeds (or let human pick the best PR).

More expensive, but higher success rate for ambiguous goals.

### Institutional Memory

Over time, Steward should build **knowledge about each repo**:

```typescript
interface RepoKnowledge {
  // Learned conventions
  conventions: {
    "Always use named exports": { confidence: 0.95, source: "PR review feedback" },
    "Tests go in __tests__ folders": { confidence: 0.99, source: "pattern detection" },
  };
  
  // Historical context
  decisions: {
    "Why we use date-fns not moment": "Bundle size, see PR #234",
    "Why auth is in a separate service": "Scaling requirements, see ADR-005",
  };
  
  // People knowledge
  ownership: {
    "packages/auth/*": ["alice", "bob"],
    "packages/api/*": ["charlie"],
  };
  
  // Failure patterns
  commonMistakes: [
    { pattern: "Forgetting to update OpenAPI spec", frequency: 5 },
    { pattern: "Missing migration for schema changes", frequency: 3 },
  ];
}
```

This knowledge persists across sessions and improves every task.

### Economic Thinking

Not all tasks are equal. Optimize for **value delivered per dollar spent.**

```typescript
interface TaskEconomics {
  estimatedCost: number;       // Model tokens + compute
  estimatedValue: number;      // Business impact
  successProbability: number;  // Based on spec quality + history
  expectedValue: number;       // value * probability - cost
}
```

Prioritize high expected-value tasks. Reject or defer negative-EV tasks.

For expensive tasks (complex, high-risk), require higher confidence specs.

### The "Explain It To Me" Test

Before dispatching a task, Steward could ask itself:

> "If I were a competent developer who just joined this project, would this task spec give me everything I need to succeed?"

If no → enrich the spec.
If still no → flag for human input.

This is essentially what the confidence scoring does, but framed as an empathy check.

### Wild Ideas (Probably Crazy)

1. **Agent Self-Review** — Before submitting PR, agent reviews its own code as if it were a different person. Catches obvious mistakes.

2. **Adversarial Testing** — Spawn a second agent whose job is to find bugs in the first agent's PR. Red team / blue team.

3. **Commit-by-Commit** — Instead of one big PR, agent commits incrementally and Steward can intervene mid-task if it's going off track.

4. **Natural Language Diffs** — Show humans "what changed" in plain English, not just code diffs. Easier to review.

5. **Repo Simulation** — Before running a task for real, simulate it on a fork. Check if it would even build. Fail fast.

6. **Cross-Repo Learning** — If agent learns something in repo A, apply that knowledge to similar repos B and C.

---

## Philosophy

The goal isn't to replace developers. It's to **amplify them**.

A great Steward:
- Handles the tedious stuff so humans focus on the interesting stuff
- Makes it easy to delegate without micromanaging
- Learns and improves without being told
- Fails gracefully and learns from mistakes
- Knows when to ask for help

We're not building an AI that codes. We're building an AI that **helps teams ship better software faster**.

---

*Last updated: 2026-01-16*
