import { listTasks, updateTask } from './store.js';
import { isContainerRunning, getContainerExitCode } from '../worker/container.js';
import { getConfig } from '../config.js';
import { debug, createLogger } from '../utils/logger.js';

const logger = createLogger('limits');

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
      updateTask(task.id, { status: 'failed', error: 'No container ID' });
      continue;
    }
    
    const running = await isContainerRunning(task.containerId);
    
    if (running) {
      runningCount++;
    } else {
      // Container stopped, update task status
      const exitCode = await getContainerExitCode(task.containerId);
      const newStatus = exitCode === 0 ? 'completed' : 'failed';
      updateTask(task.id, {
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
export async function canStartNewTask(): Promise<{ allowed: boolean; running: number; max: number }> {
  const config = getConfig();
  const max = config.maxConcurrent || 5;
  const running = await countRunningTasks();
  
  return {
    allowed: running < max,
    running,
    max,
  };
}

/**
 * Wait for a slot to become available.
 * Returns when a task can be started.
 */
export async function waitForSlot(pollIntervalMs = 5000, maxWaitMs = 300000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const { allowed } = await canStartNewTask();
    if (allowed) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Timeout waiting for task slot');
}
