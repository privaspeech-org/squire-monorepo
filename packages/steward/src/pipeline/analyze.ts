import { generateText } from 'ai';
import { createHash } from 'node:crypto';
import { StewardConfig } from '../config.js';
import { Signal } from './collect.js';
import { getActiveTasks, getRecentTasks, getFailedTasks, syncWithSquire } from '../state.js';
import {
  Task,
  TaskArray,
  validateTaskArray,
  formatValidationErrors,
  TASK_EXAMPLES,
  getSchemaDescription,
} from '../schemas/task-schema.js';

export type { Task, TaskArray };
import { createLogger } from '@squire/core';

const logger = createLogger('steward:analyze');

/**
 * Cache for LLM responses (in-memory, keyed by goal hash)
 * Cache expires after 5 minutes to balance freshness and cost savings
 */
interface CacheEntry {
  tasks: Task[];
  timestamp: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum number of retry attempts for LLM validation failures
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Analyze signals and goals to generate new coding tasks using LLM
 *
 * Features:
 * - Strict JSON schema validation with Zod
 * - Retry logic with error feedback (max 3 attempts)
 * - Response caching by goal hash (5 min TTL)
 * - Fallback structured text parsing
 * - Enhanced prompts for complete task specifications
 *
 * @see https://elite-ai-assisted-coding.dev/p/working-with-asynchronous-coding-agents
 *
 * @param config - Steward configuration
 * @param goals - Development goals from steward.yaml
 * @param signals - Collected signals from GitHub and other sources
 * @returns Array of tasks to dispatch
 */
export async function analyzeTasks(
  config: StewardConfig,
  goals: string,
  signals: Signal[]
): Promise<Task[]> {
  // Sync with Squire state before analysis
  syncWithSquire();

  // Check cache first
  const cacheKey = computeCacheKey(goals, signals);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    logger.info('Using cached LLM response', { cacheKey: cacheKey.slice(0, 8) });
    return cached;
  }

  // Generate prompt
  const prompt = buildPrompt(goals, signals);

  // Attempt LLM generation with retry logic
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      logger.info(`LLM task generation attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);

      const tasks = await generateTasksWithLLM(config, prompt, lastError, attempt);

      // Validate response
      const validation = validateTaskArray(tasks);

      if (validation.success) {
        logger.info(`Successfully generated ${validation.data.length} tasks`);

        // Cache the successful response
        setCachedResponse(cacheKey, validation.data);

        return validation.data;
      }

      // Validation failed - prepare error feedback for retry
      const errorMsg = formatValidationErrors(validation.errors);
      logger.warn(`LLM response validation failed (attempt ${attempt}):`, { errors: errorMsg });
      lastError = errorMsg;

      // If this was the last attempt, fall through to fallback
      if (attempt === MAX_RETRY_ATTEMPTS) {
        logger.error('Max retry attempts reached, attempting fallback parsing');
        break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`LLM generation error (attempt ${attempt}):`, { error: errorMsg });
      lastError = `LLM API error: ${errorMsg}`;

      if (attempt === MAX_RETRY_ATTEMPTS) {
        logger.error('Max retry attempts reached after errors, attempting fallback');
        break;  // Try fallback instead of returning early
      }
    }
  }

  // All retries failed - attempt fallback parsing
  logger.warn('Attempting fallback structured text parsing');
  try {
    const fallbackTasks = await attemptFallbackParsing(config, prompt);
    if (fallbackTasks.length > 0) {
      logger.info(`Fallback parsing succeeded with ${fallbackTasks.length} tasks`);
      setCachedResponse(cacheKey, fallbackTasks);
      return fallbackTasks;
    }
  } catch (error) {
    logger.error('Fallback parsing failed:', { error });
  }

  // Complete failure
  logger.error('All task generation attempts failed, returning empty array');
  return [];
}

/**
 * Build the LLM prompt with enhanced structure for complete task specifications
 *
 * Based on best practices from async coding agent research:
 * - Complete specifications upfront (agents can't ask questions)
 * - Context gathering (files to read, patterns to follow)
 * - Acceptance criteria (specific, testable conditions)
 * - Implementation hints (approach, files to modify)
 * - Verification steps (tests, lint, build)
 */
function buildPrompt(goals: string, signals: Signal[]): string {
  const signalSummary = signals.map(formatSignal).join('\n');

  const activeTasks = getActiveTasks();
  const activeTasksSummary = activeTasks.length > 0
    ? activeTasks.map(t => `- [${t.taskId}] ${t.repo}: ${t.prompt.slice(0, 80)}...`).join('\n')
    : 'None';

  const recentTasks = getRecentTasks(7);
  const recentTasksSummary = recentTasks.length > 0
    ? recentTasks.map(t => `- ${t.repo}: ${t.prompt.slice(0, 80)}... → ${t.prUrl || 'completed'}`).join('\n')
    : 'None';

  const failedTasks = getFailedTasks(7);
  const failedTasksSummary = failedTasks.length > 0
    ? failedTasks.map(t => `- ${t.repo}: ${t.prompt.slice(0, 80)}...`).join('\n')
    : 'None';

  // Build examples section
  const examplesJson = JSON.stringify(TASK_EXAMPLES, null, 2);

  return `You are a software development orchestrator generating tasks for AUTONOMOUS coding agents.

CRITICAL: These agents work asynchronously and CANNOT ask clarifying questions. Every task must be a COMPLETE SPECIFICATION with all context needed for success.

## GOALS
${goals}

## CURRENT SIGNALS
${signalSummary || 'No active signals'}

## ACTIVE TASKS (already in progress - DO NOT duplicate)
${activeTasksSummary}

## RECENTLY COMPLETED (last 7 days - already done)
${recentTasksSummary}

## RECENT FAILURES (last 7 days - analyze why before retrying)
${failedTasksSummary}

---

## TASK GENERATION PRINCIPLES

Based on async coding agent best practices:

### 1. Complete Specifications
Each task must be self-contained. Include:
- **What** needs to be done (clear, specific prompt)
- **Why** it matters (context)
- **How** to verify success (acceptance criteria)

### 2. Context Gathering
Help the agent understand the codebase:
- List files to read first (to understand patterns)
- Note conventions to follow
- Identify related code that might be affected

### 3. Acceptance Criteria
Be specific and testable:
- ❌ Bad: "Fix the bug"
- ✅ Good: "Users can log in without 500 errors; login endpoint returns JWT within 200ms"

### 4. Implementation Hints
Guide the approach:
- Suggest which files to modify
- Note any constraints (don't change X, avoid Y)
- Point to similar code for reference

### 5. Verification Steps
Ensure quality before PR:
- Should tests run? Which ones?
- Should lint/build pass?
- Any custom checks needed?

### 6. Right-Sized Tasks
One focused change per task. If a goal is big, break it into smaller tasks with depends_on relationships.

---

## RULES

1. Do NOT create tasks that duplicate active tasks
2. Do NOT recreate recently completed tasks unless signals indicate a problem
3. Be cautious about retrying failed tasks - only if you have NEW information
4. Focus on CI failures (high priority), actionable issues, progress toward goals
5. Skip tasks for PRs that just need human review

---

## RESPONSE FORMAT

Respond with ONLY a valid JSON array. No markdown, no explanations.

**JSON Schema:**
${getSchemaDescription()}

**Complete Examples:**
${examplesJson}

**Your Response (valid JSON array only):**`;
}

/**
 * Format a signal for display in the prompt
 */
function formatSignal(s: Signal): string {
  if (s.type === 'greptile_review' && s.data.parsed) {
    const p = s.data.parsed as { file: string; line: number; description: string };
    const confidence = s.greptile_confidence !== undefined ? ` [confidence: ${s.greptile_confidence}/5]` : '';
    return `[github/greptile_review] PR#${s.data.prNumber}: ${p.file}:${p.line} - ${p.description}${confidence}`;
  }

  // Format different signal types for clarity
  if (s.type === 'failed_ci') {
    return `[${s.source}/failed_ci] ⚠️ CI FAILURE: ${JSON.stringify(s.data)}`;
  }
  if (s.type === 'open_issue') {
    return `[${s.source}/issue] ${JSON.stringify(s.data)}`;
  }
  if (s.type === 'open_pr') {
    return `[${s.source}/pr] ${JSON.stringify(s.data)}`;
  }

  return `[${s.source}/${s.type}] ${JSON.stringify(s.data)}`;
}

/**
 * Generate tasks using LLM with optional error feedback for retry
 */
async function generateTasksWithLLM(
  config: StewardConfig,
  basePrompt: string,
  previousError: string | undefined,
  attempt: number
): Promise<unknown> {
  // Add error feedback for retry attempts
  let prompt = basePrompt;
  if (previousError && attempt > 1) {
    prompt = `${basePrompt}

**IMPORTANT - Previous attempt failed with these errors:**
${previousError}

Please fix these issues and respond with a valid JSON array that matches the schema.
Remember: Include context, acceptance_criteria, implementation, and verification for complete task specs.`;
  }

  const result = await generateText({
    model: config.llm.model,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = result.text || '[]';

  // Clean up potential markdown code blocks
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Parse JSON
  try {
    const parsed = JSON.parse(jsonContent);

    // Handle both direct array and wrapped object formats
    return Array.isArray(parsed) ? parsed : (parsed.tasks || []);
  } catch (error) {
    logger.warn('Failed to parse LLM response as JSON', {
      attempt,
      contentPreview: content.slice(0, 200),
    });
    throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fallback: Attempt to parse tasks from structured text if JSON parsing fails
 *
 * This handles cases where LLM returns a reasonable response but not in valid JSON format
 */
async function attemptFallbackParsing(
  config: StewardConfig,
  originalPrompt: string
): Promise<Task[]> {
  const fallbackPrompt = `${originalPrompt}

**CRITICAL: The previous responses were not valid JSON. Please respond with ONLY valid JSON, no other text.**

Example valid response:
[]

or

[{"prompt": "Fix the build error in container.ts", "priority": "high", "depends_on": [], "acceptance_criteria": ["Build passes", "No test regressions"]}]`;

  try {
    const result = await generateText({
      model: config.llm.model,
      messages: [{ role: 'user', content: fallbackPrompt }],
    });

    let content = result.text?.trim() || '[]';

    // More aggressive cleanup for fallback
    content = content.replace(/^```(?:json)?\s*/gm, '');
    content = content.replace(/```\s*$/gm, '');
    content = content.replace(/^[^[\{]*/s, ''); // Remove text before first [ or {
    content = content.replace(/[^}\]]*$/s, ''); // Remove text after last } or ]

    const parsed = JSON.parse(content);
    const data = Array.isArray(parsed) ? parsed : (parsed.tasks || []);

    const validation = validateTaskArray(data);
    if (validation.success) {
      return validation.data;
    }

    logger.warn('Fallback parsing produced invalid data', {
      errors: formatValidationErrors(validation.errors),
    });
    return [];
  } catch (error) {
    logger.error('Fallback parsing failed', { error });
    return [];
  }
}

/**
 * Compute cache key from goals and signals
 */
function computeCacheKey(goals: string, signals: Signal[]): string {
  const signalsDigest = signals
    .map(s => `${s.source}:${s.type}:${JSON.stringify(s.data)}`)
    .join('|');

  const combined = `${goals}|${signalsDigest}`;
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Get cached response if available and not expired
 */
function getCachedResponse(key: string): Task[] | null {
  const entry = responseCache.get(key);

  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  return entry.tasks;
}

/**
 * Store response in cache
 */
function setCachedResponse(key: string, tasks: Task[]): void {
  responseCache.set(key, {
    tasks,
    timestamp: Date.now(),
  });

  // Cleanup old entries (simple LRU)
  if (responseCache.size > 100) {
    const sortedEntries = Array.from(responseCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20%
    const toRemove = sortedEntries.slice(0, 20);
    toRemove.forEach(([k]) => responseCache.delete(k));
  }
}
