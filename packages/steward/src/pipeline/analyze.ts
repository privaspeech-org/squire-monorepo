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
 * - Improved prompt engineering with examples
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
 * Build the LLM prompt with improved structure and examples
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

  return `You are a software development orchestrator. Given the goals, signals, and task history, determine what NEW coding tasks should be created.

## GOALS
${goals}

## CURRENT SIGNALS
${signalSummary}

## ACTIVE TASKS (already in progress - DO NOT duplicate)
${activeTasksSummary}

## RECENTLY COMPLETED (last 7 days - already done)
${recentTasksSummary}

## RECENT FAILURES (last 7 days - be careful retrying these)
${failedTasksSummary}

---

## INSTRUCTIONS

Based on this context, what NEW coding tasks should be created?

**Rules:**
1. Do NOT create tasks that duplicate active tasks
2. Do NOT recreate recently completed tasks unless signals indicate a problem
3. Be cautious about retrying failed tasks - only if you have new information
4. Focus on CI failures (high priority), actionable issues, progress toward goals
5. Skip tasks for PRs that just need human review

**Response Format:**

You MUST respond with ONLY a valid JSON array. Do not include any other text, markdown formatting, or explanations.

**JSON Schema:**
${getSchemaDescription()}

**Valid Examples:**
${examplesJson}

**Response (valid JSON array only):**`;
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

Please fix these issues and respond with a valid JSON array that matches the schema.`;
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

[{"prompt": "Fix the build error in container.ts", "priority": "high", "depends_on": []}]`;

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
