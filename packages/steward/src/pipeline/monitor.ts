import { StewardConfig } from '../config.js';
import { DispatchedTask } from './dispatch.js';
import { updateTaskStatus, syncWithSquire, getActiveTasks } from '../state.js';
import { getTask as getSquireTask, type Task } from '@squire/core';

export interface TaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'unknown';
  prUrl?: string;
}

export async function monitorTasks(
  config: StewardConfig,
  tasks: DispatchedTask[]
): Promise<TaskStatus[]> {
  const statuses: TaskStatus[] = [];

  // Check newly dispatched tasks
  for (const task of tasks) {
    if (task.status !== 'dispatched' || !task.taskId) continue;

    const status = checkTaskStatus(task.taskId);
    statuses.push(status);
    console.log(`   ${task.taskId}: ${status.status}`);
  }

  // Also sync all active tasks in state
  syncWithSquire();

  return statuses;
}

export function checkTaskStatus(taskId: string): TaskStatus {
  const squireTask = getSquireTask(taskId);

  if (!squireTask) {
    return { taskId, status: 'unknown' };
  }

  switch (squireTask.status) {
    case 'completed':
      return {
        taskId,
        status: 'completed',
        prUrl: squireTask.prUrl,
      };
    case 'failed':
      return { taskId, status: 'failed' };
    case 'running':
      return { taskId, status: 'running' };
    case 'pending':
      return { taskId, status: 'running' }; // Treat pending as running for monitoring purposes
    default:
      return { taskId, status: 'unknown' };
  }
}

// Full sync of all tracked tasks
export async function syncAllTasks(): Promise<void> {
  console.log('🔄 Syncing task states...');

  const activeTasks = getActiveTasks();
  let updated = 0;

  for (const task of activeTasks) {
    const status = checkTaskStatus(task.taskId);

    if (status.status === 'completed' || status.status === 'failed') {
      updateTaskStatus(task.taskId, status.status, status.prUrl);
      updated++;
      console.log(`   ${task.taskId}: ${task.status} → ${status.status}`);
    }
  }

  console.log(`   Updated ${updated} tasks`);
}
