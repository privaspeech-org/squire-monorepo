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

*Last updated: 2026-01-16*
