import { listTasks, getTask, updateTask } from './store.js';
import { isContainerRunning, getContainerExitCode } from '../worker/container.js';
import { debug } from '../utils/logger.js';
import type { Task } from '../types/task.js';

/**
 * Sync a single task's status with its container status.
 * If the task is marked as "running" but the container has stopped,
 * updates the task status to "completed" or "failed" based on exit code.
 * Returns the updated task (or original if no update needed).
 */
export async function syncTaskStatus(taskId: string): Promise<Task | null> {
  const task = getTask(taskId);
  if (!task) {
    return null;
  }

  // Only sync running tasks
  if (task.status !== 'running') {
    return task;
  }

  // If no container ID, mark as failed
  if (!task.containerId) {
    await updateTask(task.id, {
      status: 'failed',
      error: 'No container ID',
      completedAt: new Date().toISOString(),
    });
    return getTask(taskId);
  }

  // Check if container is still running
  const running = await isContainerRunning(task.containerId);
  if (running) {
    return task;
  }

  // Container stopped, update task status based on exit code
  const exitCode = await getContainerExitCode(task.containerId);
  const newStatus = exitCode === 0 ? 'completed' : 'failed';

  await updateTask(task.id, {
    status: newStatus,
    error: exitCode !== 0 ? `Container exited with code ${exitCode}` : undefined,
    completedAt: new Date().toISOString(),
  });

  debug('limits', 'Synced task status with container', {
    taskId: task.id,
    newStatus,
    exitCode,
  });

  return getTask(taskId);
}

/**
 * Count currently running tasks.
 * Also updates task status if containers have stopped.
 */
export async function countRunningTasks(): Promise<number> {
  const tasks = listTasks('running');
  let runningCount = 0;

  for (const task of tasks) {
    if (!task.containerId) {
      // No container ID, mark as failed
      await updateTask(task.id, { status: 'failed', error: 'No container ID' });
      continue;
    }

    const running = await isContainerRunning(task.containerId);

    if (running) {
      runningCount++;
    } else {
      // Container stopped, update task status
      const exitCode = await getContainerExitCode(task.containerId);
      const newStatus = exitCode === 0 ? 'completed' : 'failed';
      await updateTask(task.id, {
        status: newStatus,
        error: exitCode !== 0 ? `Container exited with code ${exitCode}` : undefined,
        completedAt: new Date().toISOString(),
      });

      debug('limits', 'Task container stopped', {
        taskId: task.id,
        newStatus,
        exitCode,
      });
    }
  }

  debug('limits', 'Running tasks count', { count: runningCount });
  return runningCount;
}

/**
 * Check if we can start a new task based on limits.
 */
export async function canStartNewTask(maxConcurrent: number = 5): Promise<{ allowed: boolean; running: number; max: number }> {
  const running = await countRunningTasks();

  return {
    allowed: running < maxConcurrent,
    running,
    max: maxConcurrent,
  };
}

/**
 * Wait for a slot to become available.
 * Returns when a task can be started.
 */
export async function waitForSlot(maxConcurrent: number = 5, pollIntervalMs = 5000, maxWaitMs = 300000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { allowed } = await canStartNewTask(maxConcurrent);
    if (allowed) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Timeout waiting for task slot');
}
