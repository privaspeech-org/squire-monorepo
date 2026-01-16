# Task Specification Improvements

> Based on [Working with Asynchronous Coding Agents](https://elite-ai-assisted-coding.dev/p/working-with-asynchronous-coding-agents) by Eleanor Berger

## Problem

Current task specs are minimal:
```typescript
{
  prompt: string,      // Just the task description
  priority: 'high' | 'medium' | 'low',
  repo?: string,
  depends_on: string[]
}
```

Async agents need **complete specifications upfront** — they can't ask clarifying questions or course-correct mid-task.

## Proposed Enhanced Task Schema

```typescript
interface EnhancedTask {
  // === Core (existing) ===
  prompt: string;
  priority: 'high' | 'medium' | 'low';
  repo?: string;
  depends_on?: string[];

  // === NEW: Context ===
  context?: {
    files_to_read?: string[];      // Files to examine before starting
    patterns_to_follow?: string[]; // Existing patterns/conventions to match
    related_code?: string[];       // Other files that might be affected
  };

  // === NEW: Acceptance Criteria ===
  acceptance_criteria?: string[];  // Specific, testable conditions for success
  // Example:
  // - "All existing tests pass"
  // - "New endpoint returns 200 for valid input"
  // - "Error messages include error codes"

  // === NEW: Implementation Hints ===
  implementation?: {
    approach?: string;           // Suggested approach
    files_to_modify?: string[];  // Primary files that need changes
    files_to_create?: string[];  // New files to add
    avoid?: string[];            // Things NOT to do
  };

  // === NEW: Verification ===
  verification?: {
    run_tests?: boolean;         // Default: true
    run_lint?: boolean;          // Default: true  
    run_build?: boolean;         // Default: true
    custom_checks?: string[];    // Additional commands to run
    // Example: ["pnpm typecheck", "pnpm test:e2e"]
  };
}
```

## Enhanced Prompt Template

The `buildPrompt()` function should generate richer context:

```typescript
function buildPrompt(goals: string, signals: Signal[], repoContext?: RepoContext): string {
  return `You are a software development orchestrator generating tasks for autonomous coding agents.

## GOALS
${goals}

## CURRENT SIGNALS
${formatSignals(signals)}

## REPOSITORY CONTEXT
${repoContext ? formatRepoContext(repoContext) : 'Not available'}

## ACTIVE TASKS (DO NOT duplicate)
${formatActiveTasks()}

## RECENT COMPLETIONS (already done)
${formatRecentTasks()}

---

## TASK GENERATION RULES

1. **Complete Specifications**: Each task must be self-contained. The agent cannot ask questions.

2. **Context Gathering**: Include files the agent should read first to understand patterns.

3. **Acceptance Criteria**: Be specific. "Fix the bug" is bad. "Users can log in without 500 errors" is good.

4. **Implementation Hints**: Suggest approach and files to modify based on codebase patterns.

5. **Verification Steps**: Always include what checks should pass before PR submission.

6. **Right-Sized Tasks**: One focused change per task. Break big goals into smaller tasks.

## JSON SCHEMA
${getEnhancedSchemaDescription()}

## EXAMPLES
${JSON.stringify(ENHANCED_TASK_EXAMPLES, null, 2)}

**Response (valid JSON array only):**`;
}
```

## Example Enhanced Tasks

### Before (current)
```json
{
  "prompt": "Fix the CI build failure",
  "priority": "high"
}
```

### After (enhanced)
```json
{
  "prompt": "Fix CI build failure: TypeError in container.ts - startTaskContainer missing null check for config.workerImage",
  "priority": "high",
  "context": {
    "files_to_read": [
      "packages/core/src/worker/container.ts",
      "packages/core/src/worker/types.ts"
    ],
    "patterns_to_follow": [
      "See error handling in docker.ts for similar null checks"
    ]
  },
  "acceptance_criteria": [
    "CI build passes on main branch",
    "No regression in existing container tests",
    "Handles missing workerImage gracefully with clear error message"
  ],
  "implementation": {
    "approach": "Add null/undefined check before accessing config.workerImage, throw descriptive ContainerError if missing",
    "files_to_modify": ["packages/core/src/worker/container.ts"],
    "avoid": ["Don't change the function signature", "Don't add new dependencies"]
  },
  "verification": {
    "run_tests": true,
    "run_lint": true,
    "run_build": true,
    "custom_checks": ["pnpm test --filter=@squire/core"]
  }
}
```

## Implementation Plan

### Phase 1: Schema Update
1. Update `task-schema.ts` with new optional fields
2. Keep backward compatible (new fields optional)
3. Update validation and examples

### Phase 2: Prompt Enhancement  
1. Update `buildPrompt()` in `analyze.ts`
2. Add repo context gathering (package.json scripts, existing patterns)
3. Add examples showing full specification format

### Phase 3: Worker Integration
1. Update `agent-prompt.md` to use new task fields
2. Pass acceptance criteria and verification steps to worker
3. Have worker run verification before PR submission

### Phase 4: Context Gathering (Future)
1. Add optional repo analysis step before task generation
2. Use code search to find relevant files/patterns
3. Build `RepoContext` object for prompt enrichment

## Migration

- New fields are optional → existing tasks still work
- Steward gradually generates richer specs as prompt improves
- Workers use new fields when present, fall back to current behavior

## Success Metrics

- Fewer task failures due to missing context
- Higher first-attempt PR merge rate
- Reduced "specification bugs" (failures from unclear requirements)
