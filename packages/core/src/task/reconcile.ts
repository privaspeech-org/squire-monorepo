/**
 * Task Reconciliation
 *
 * Reconciles the state between task files and backend workers (Jobs/containers).
 * Handles recovery after restarts and cleans up orphaned resources.
 */

import { listTasks, getTask, updateTask, deleteTask } from './store.js';
import { getBackend } from '../worker/backend.js';
import { info, warn, debug, createLogger } from '../utils/logger.js';
import type { Task } from '../types/task.js';
import type { WorkerTaskInfo } from '../worker/types.js';

const log = createLogger('reconcile');

export interface ReconcileResult {
  tasksReconciled: number;
  tasksMarkedFailed: number;
  tasksMarkedCompleted: number;
  orphanedWorkersRemoved: number;
  errors: string[];
}

export interface ReconcileOptions {
  dryRun?: boolean;
  removeOrphanedWorkers?: boolean;
}

/**
 * Reconcile task states with backend worker states.
 *
 * Handles these cases:
 * 1. Task is "running" but no worker exists → Mark task as failed
 * 2. Task is "running" but worker completed → Update task status from worker
 * 3. Worker exists but no task file → Remove orphaned worker
 * 4. Task is "running" and worker is running → No change
 *
 * @param options - Reconciliation options
 * @returns Summary of reconciliation actions
 */
export async function reconcileTasks(options: ReconcileOptions = {}): Promise<ReconcileResult> {
  const { dryRun = false, removeOrphanedWorkers = true } = options;

  const result: ReconcileResult = {
    tasksReconciled: 0,
    tasksMarkedFailed: 0,
    tasksMarkedCompleted: 0,
    orphanedWorkersRemoved: 0,
    errors: [],
  };

  try {
    // Get current state from backend
    const backend = await getBackend();
    const workers = await backend.listTasks();
    const workersByTaskId = new Map<string, WorkerTaskInfo>();
    for (const worker of workers) {
      if (worker.taskId) {
        workersByTaskId.set(worker.taskId, worker);
      }
    }

    log.info('Starting reconciliation', {
      dryRun,
      workerCount: workers.length,
    });

    // Get all running tasks
    const runningTasks = listTasks('running');

    // Reconcile running tasks
    for (const task of runningTasks) {
      result.tasksReconciled++;

      const worker = workersByTaskId.get(task.id);

      if (!worker) {
        // Case 1: Task is running but no worker exists
        log.warn('Orphaned task found (no worker)', {
          taskId: task.id,
          containerId: task.containerId,
        });

        if (!dryRun) {
          await updateTask(task.id, {
            status: 'failed',
            error: 'Worker not found during reconciliation (orphaned task)',
            completedAt: new Date().toISOString(),
          });
        }
        result.tasksMarkedFailed++;
        continue;
      }

      if (!worker.running) {
        // Case 2: Task is running but worker completed
        const newStatus = worker.exitCode === 0 ? 'completed' : 'failed';

        log.info('Updating task status from worker', {
          taskId: task.id,
          workerId: worker.workerId,
          exitCode: worker.exitCode,
          newStatus,
        });

        if (!dryRun) {
          await updateTask(task.id, {
            status: newStatus,
            error: worker.exitCode !== 0
              ? `Worker exited with code ${worker.exitCode} (discovered during reconciliation)`
              : undefined,
            completedAt: new Date().toISOString(),
          });
        }

        if (newStatus === 'completed') {
          result.tasksMarkedCompleted++;
        } else {
          result.tasksMarkedFailed++;
        }
      }
      // Case 4: Task running, worker running → No change needed
    }

    // Case 3: Find orphaned workers (workers with no corresponding task)
    if (removeOrphanedWorkers) {
      for (const worker of workers) {
        if (!worker.taskId) {
          // Worker has no task ID - shouldn't happen but clean up
          log.warn('Worker with no task ID found', {
            workerId: worker.workerId,
          });

          if (!dryRun) {
            try {
              await backend.removeTask(worker.workerId);
              result.orphanedWorkersRemoved++;
            } catch (err) {
              const errMsg = `Failed to remove orphaned worker ${worker.workerId}: ${err}`;
              log.error(errMsg, { workerId: worker.workerId, error: err });
              result.errors.push(errMsg);
            }
          } else {
            result.orphanedWorkersRemoved++;
          }
          continue;
        }

        const task = getTask(worker.taskId);
        if (!task) {
          // Worker exists but no task file
          log.warn('Orphaned worker found (no task file)', {
            taskId: worker.taskId,
            workerId: worker.workerId,
          });

          if (!dryRun) {
            try {
              await backend.removeTask(worker.workerId);
              result.orphanedWorkersRemoved++;
            } catch (err) {
              const errMsg = `Failed to remove orphaned worker ${worker.workerId}: ${err}`;
              log.error(errMsg, { workerId: worker.workerId, error: err });
              result.errors.push(errMsg);
            }
          } else {
            result.orphanedWorkersRemoved++;
          }
        }
      }
    }

    log.info('Reconciliation complete', {
      dryRun,
      ...result,
    });

    return result;
  } catch (err) {
    const errMsg = `Reconciliation failed: ${err}`;
    log.error(errMsg, { error: err });
    result.errors.push(errMsg);
    return result;
  }
}

/**
 * Check if reconciliation is needed.
 * Returns true if there are potentially inconsistent states.
 */
export async function needsReconciliation(): Promise<boolean> {
  try {
    const runningTasks = listTasks('running');
    if (runningTasks.length === 0) {
      return false;
    }

    const backend = await getBackend();
    const workers = await backend.listTasks();
    const workerTaskIds = new Set(workers.map(w => w.taskId));

    // Check if any running task doesn't have a corresponding worker
    for (const task of runningTasks) {
      if (!workerTaskIds.has(task.id)) {
        return true;
      }
    }

    // Check if any worker has completed but task is still running
    for (const worker of workers) {
      if (!worker.running && worker.taskId) {
        const task = getTask(worker.taskId);
        if (task && task.status === 'running') {
          return true;
        }
      }
    }

    return false;
  } catch {
    // If we can't check, assume reconciliation might be needed
    return true;
  }
}

// Track if reconciliation has been run in this process
let hasReconciled = false;

/**
 * Run reconciliation once per process startup.
 * Safe to call multiple times - will only run once.
 */
export async function reconcileOnce(options?: ReconcileOptions): Promise<ReconcileResult | null> {
  if (hasReconciled) {
    debug('reconcile', 'Skipping reconciliation (already run)');
    return null;
  }

  hasReconciled = true;
  return reconcileTasks(options);
}

/**
 * Reset the reconciliation flag (for testing).
 */
export function resetReconcileFlag(): void {
  hasReconciled = false;
}
