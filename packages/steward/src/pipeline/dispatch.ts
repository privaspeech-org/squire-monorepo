import { StewardConfig } from '../config.js';
import { Task } from './analyze.js';
import { recordTask, getActiveTasks } from '../state.js';
import {
  createTask as createSquireTask,
  startTaskContainer,
  listTasks as listSquireTasks,
} from '@squire/core';

export interface DispatchedTask extends Task {
  taskId: string;
  status: 'dispatched' | 'failed';
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

  // Respect concurrency limits (check both Steward state and Squire running count)
  const maxConcurrent = squireConfig.max_concurrent || 3;
  const activeTasks = getActiveTasks().length;
  const squireRunning = listSquireTasks('running').length;
  const currentActive = Math.max(activeTasks, squireRunning);
  const available = maxConcurrent - currentActive;

  if (available <= 0) {
    console.log(`   Max concurrent tasks (${maxConcurrent}) reached, skipping dispatch`);
    return [];
  }

  const toDispatch = tasks.slice(0, available);

  for (const task of toDispatch) {
    try {
      const repo = task.repo || squireConfig.default_repo;
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

      dispatched.push({
        ...task,
        taskId: squireTask.id,
        status: 'dispatched',
      });

      console.log(`   ✓ Dispatched ${squireTask.id}: ${task.prompt.slice(0, 40)}...`);
    } catch (err) {
      console.error(`   ✗ Failed to dispatch: ${task.prompt.slice(0, 40)}...`);
      console.error(`     ${err instanceof Error ? err.message : err}`);
      dispatched.push({
        ...task,
        taskId: '',
        status: 'failed',
      });
    }
  }

  return dispatched;
}
