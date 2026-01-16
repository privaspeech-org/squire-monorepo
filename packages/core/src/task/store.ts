import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import type { Task, TaskCreateOptions, TaskStatus } from '../types/task.js';
import { debug, info, warn } from '../utils/logger.js';
import { withLockSync, LockError } from './locking.js';

let tasksDir = process.env.SQUIRE_TASKS_DIR || join(process.cwd(), 'tasks');

export function setTasksDir(dir: string): void {
  tasksDir = dir;
}

export function getTasksDir(): string {
  return tasksDir;
}

function ensureTasksDir(): void {
  if (!existsSync(tasksDir)) {
    mkdirSync(tasksDir, { recursive: true });
  }
}

function taskPath(id: string): string {
  return join(tasksDir, `${id}.json`);
}

export function createTask(options: TaskCreateOptions): Task {
  ensureTasksDir();

  const id = nanoid(10);
  const task: Task = {
    id,
    repo: options.repo,
    prompt: options.prompt,
    branch: options.branch || `squire/${id}`,
    baseBranch: options.baseBranch || 'auto',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Write task file (no lock needed for new file creation)
  writeFileSync(taskPath(id), JSON.stringify(task, null, 2));

  info('task-store', 'Task created', {
    taskId: task.id,
    repo: task.repo,
    branch: task.branch,
  });

  return task;
}

export function getTask(id: string): Task | null {
  const path = taskPath(id);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const path = taskPath(id);

  // Check if task exists before attempting to lock
  if (!existsSync(path)) {
    return null;
  }

  try {
    // Use withLockSync to acquire lock, update, and release automatically
    // This provides transaction-like semantics: Read → Lock → Modify → Write → Unlock
    return await withLockSync(
      path,
      () => {
        // Re-read task inside lock to ensure we have latest state
        const task = getTask(id);
        if (!task) {
          return null;
        }

        const oldStatus = task.status;
        const updated = { ...task, ...updates };

        // Write updated task to disk while holding lock
        writeFileSync(path, JSON.stringify(updated, null, 2));

        if (updates.status && updates.status !== oldStatus) {
          info('task-store', 'Task status changed', {
            taskId: id,
            oldStatus,
            newStatus: updates.status,
          });
        }

        return updated;
      },
      { timeout: 5000, staleTimeout: 30000 },
    );
  } catch (error) {
    if (error instanceof LockError) {
      warn('task-store', 'Failed to acquire lock for task update', {
        taskId: id,
        error: error.message,
      });
      throw new Error(`Failed to update task ${id}: ${error.message}`);
    }
    throw error;
  }
}

export function listTasks(status?: TaskStatus): Task[] {
  ensureTasksDir();

  const files = readdirSync(tasksDir).filter(f => f.endsWith('.json'));
  const tasks: Task[] = files.map(f => {
    const content = readFileSync(join(tasksDir, f), 'utf-8');
    return JSON.parse(content);
  });

  if (status) {
    const filtered = tasks.filter(t => t.status === status);
    debug('task-store', 'Listed tasks', { status, count: filtered.length });
    return filtered;
  }

  const sorted = tasks.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  debug('task-store', 'Listed all tasks', { count: sorted.length });
  return sorted;
}

export async function deleteTask(id: string): Promise<boolean> {
  const path = taskPath(id);

  // Check if task exists before attempting to lock
  if (!existsSync(path)) {
    return false;
  }

  try {
    // Use withLockSync to acquire lock, delete, and release automatically
    return await withLockSync(
      path,
      () => {
        // Double-check file still exists after acquiring lock
        if (!existsSync(path)) {
          return false;
        }

        // Delete the task file while holding lock
        unlinkSync(path);

        info('task-store', 'Task deleted', { taskId: id });
        return true;
      },
      { timeout: 5000, staleTimeout: 30000 },
    );
  } catch (error) {
    if (error instanceof LockError) {
      warn('task-store', 'Failed to acquire lock for task deletion', {
        taskId: id,
        error: error.message,
      });
      throw new Error(`Failed to delete task ${id}: ${error.message}`);
    }
    throw error;
  }
}
