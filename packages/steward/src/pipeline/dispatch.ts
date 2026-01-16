import { StewardConfig } from '../config.js';
import { Task } from './analyze.js';
import { recordTask, getActiveTasks } from '../state.js';
import {
  createTask as createSquireTask,
  startTaskContainer,
  listTasks as listSquireTasks,
  createLogger,
} from '@squire/core';

const logger = createLogger('steward:dispatch');

export interface DispatchedTask extends Task {
  taskId: string;
  repo: string;
  status: 'dispatched' | 'failed';
}

/**
 * Get the list of allowed repos from config
 */
function getAllowedRepos(config: StewardConfig): Set<string> {
  const repos = new Set<string>();

  // Add default repo
  if (config.execution.squire?.default_repo) {
    repos.add(config.execution.squire.default_repo);
  }

  // Add explicitly configured repos
  if (config.execution.squire?.repos) {
    for (const repo of config.execution.squire.repos) {
      repos.add(repo);
    }
  }

  // Add repos from signals config (these are the repos we're watching)
  if (config.signals.github?.repos) {
    for (const repo of config.signals.github.repos) {
      repos.add(repo);
    }
  }

  return repos;
}

/**
 * Count running tasks per repo
 */
function countTasksByRepo(tasks: Array<{ repo?: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.repo) {
      counts.set(task.repo, (counts.get(task.repo) || 0) + 1);
    }
  }
  return counts;
}

export async function dispatchTasks(
  config: StewardConfig,
  tasks: Task[]
): Promise<DispatchedTask[]> {
  const dispatched: DispatchedTask[] = [];
  const squireConfig = config.execution.squire;

  if (!squireConfig) {
    throw new Error('Squire config not found');
  }

  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN not set - required for dispatching tasks');
  }

  // Get allowed repos
  const allowedRepos = getAllowedRepos(config);

  // Respect concurrency limits (check both Steward state and Squire running count)
  const maxConcurrent = squireConfig.max_concurrent || 3;
  const maxPerRepo = squireConfig.max_per_repo;

  const activeTasks = getActiveTasks();
  const squireRunningTasks = listSquireTasks('running');
  const currentActive = Math.max(activeTasks.length, squireRunningTasks.length);
  const availableGlobal = maxConcurrent - currentActive;

  if (availableGlobal <= 0) {
    logger.info(`Max concurrent tasks (${maxConcurrent}) reached, skipping dispatch`);
    return [];
  }

  // Count running tasks per repo for per-repo limits
  const runningByRepo = countTasksByRepo([
    ...activeTasks.map(t => ({ repo: t.repo })),
    ...squireRunningTasks.map(t => ({ repo: t.repo })),
  ]);

  let dispatchedCount = 0;

  for (const task of tasks) {
    // Check global limit
    if (dispatchedCount >= availableGlobal) {
      logger.info(`Global limit reached, stopping dispatch`);
      break;
    }

    try {
      // Determine target repo: use task.repo if valid, otherwise default_repo
      let repo = squireConfig.default_repo;

      if (task.repo) {
        // Validate that the repo is in the allowed list
        if (allowedRepos.has(task.repo)) {
          repo = task.repo;
        } else {
          logger.warn(`Task repo '${task.repo}' not in allowed repos, using default`);
        }
      }

      // Check per-repo limit if configured
      if (maxPerRepo !== undefined) {
        const repoRunning = (runningByRepo.get(repo) || 0);
        if (repoRunning >= maxPerRepo) {
          logger.info(`Per-repo limit (${maxPerRepo}) reached for ${repo}, skipping task`);
          continue;
        }
      }

      const model = squireConfig.model;

      // Create task using @squire/core programmatic API
      const squireTask = createSquireTask({
        repo,
        prompt: task.prompt,
      });

      // Start the container
      await startTaskContainer({
        task: squireTask,
        githubToken,
        model,
      });

      // Record to steward state
      recordTask({
        taskId: squireTask.id,
        repo,
        prompt: task.prompt,
        status: 'dispatched',
      });

      // Update running count for per-repo tracking
      runningByRepo.set(repo, (runningByRepo.get(repo) || 0) + 1);

      dispatched.push({
        ...task,
        taskId: squireTask.id,
        repo,
        status: 'dispatched',
      });

      dispatchedCount++;
      logger.info(`Dispatched task`, {
        taskId: squireTask.id,
        repo,
        prompt: task.prompt.slice(0, 40),
      });
    } catch (err) {
      const repo = task.repo || squireConfig.default_repo;
      logger.error(`Failed to dispatch task`, {
        repo,
        prompt: task.prompt.slice(0, 40),
        error: err instanceof Error ? err.message : String(err),
      });
      dispatched.push({
        ...task,
        taskId: '',
        repo,
        status: 'failed',
      });
    }
  }

  return dispatched;
}
