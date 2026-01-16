/**
 * Container Management (Backward Compatibility Layer)
 *
 * This module provides backward-compatible exports that delegate to the
 * current backend (Docker or Kubernetes). For new code, prefer using
 * the backend abstraction directly via getBackend().
 */

import type { Task, ContainerConfig } from '../types/task.js';
import { getBackend } from './backend.js';

export interface ContainerOptions {
  task: Task;
  githubToken: string;
  model?: string;
  verbose?: boolean;
  workerImage?: string;
  containerConfig?: ContainerConfig;
}

/**
 * Start a container to execute a task.
 * Delegates to the current backend (Docker or Kubernetes).
 *
 * @deprecated Use getBackend().startTask() for new code
 */
export async function startTaskContainer(options: ContainerOptions): Promise<string> {
  const backend = getBackend();
  return backend.startTask(options);
}

/**
 * Get logs from a task's container/job.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().getTaskLogs() for new code
 */
export async function getContainerLogs(containerId: string, tail?: number): Promise<string> {
  const backend = getBackend();
  return backend.getTaskLogs(containerId, tail);
}

/**
 * Check if a container/job is still running.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().isTaskRunning() for new code
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  const backend = getBackend();
  return backend.isTaskRunning(containerId);
}

/**
 * Get container/job exit code.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().getTaskExitCode() for new code
 */
export async function getContainerExitCode(containerId: string): Promise<number | null> {
  const backend = getBackend();
  return backend.getTaskExitCode(containerId);
}

/**
 * Stop a running container/job.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().stopTask() for new code
 */
export async function stopContainer(containerId: string): Promise<void> {
  const backend = getBackend();
  return backend.stopTask(containerId);
}

/**
 * Remove a container/job.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().removeTask() for new code
 */
export async function removeContainer(
  containerId: string,
  _options?: { preserveLogs?: boolean; taskId?: string }
): Promise<void> {
  const backend = getBackend();
  return backend.removeTask(containerId);
}

/**
 * List all squire containers/jobs.
 * Delegates to the current backend.
 *
 * @deprecated Use getBackend().listTasks() for new code
 */
export async function listSquireContainers(): Promise<Array<{
  Id: string;
  Labels: Record<string, string>;
  State: string;
  Created: number;
}>> {
  const backend = getBackend();
  const tasks = await backend.listTasks();

  // Convert to Docker-like format for backward compatibility
  return tasks.map(task => ({
    Id: task.workerId,
    Labels: {
      'squire.task.id': task.taskId,
      'squire.repo': task.repo || '',
      'squire.retry': String(task.retryCount || 0),
    },
    State: task.running ? 'running' : 'exited',
    Created: task.createdAt ? Math.floor(new Date(task.createdAt).getTime() / 1000) : 0,
  }));
}
