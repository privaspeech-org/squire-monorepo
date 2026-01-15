import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getTask as getSquireTask, type Task } from '@squire/core';

export interface TaskRecord {
  taskId: string;
  repo: string;
  prompt: string;
  status: 'dispatched' | 'completed' | 'failed';
  dispatchedAt: string;
  completedAt?: string;
  prUrl?: string;
}

export interface StewardState {
  tasks: TaskRecord[];
  lastRun?: string;
}

const STATE_FILE = './steward-state.json';

export function loadState(): StewardState {
  if (!existsSync(STATE_FILE)) {
    return { tasks: [] };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { tasks: [] };
  }
}

export function saveState(state: StewardState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function recordTask(task: Omit<TaskRecord, 'dispatchedAt'>): void {
  const state = loadState();
  state.tasks.push({
    ...task,
    dispatchedAt: new Date().toISOString(),
  });
  saveState(state);
}

export function updateTaskStatus(
  taskId: string,
  status: 'completed' | 'failed',
  prUrl?: string
): void {
  const state = loadState();
  const task = state.tasks.find(t => t.taskId === taskId);
  if (task) {
    task.status = status;
    task.completedAt = new Date().toISOString();
    if (prUrl) task.prUrl = prUrl;
    saveState(state);
  }
}

export function getActiveTasks(): TaskRecord[] {
  const state = loadState();
  return state.tasks.filter(t => t.status === 'dispatched');
}

export function getRecentTasks(days: number): TaskRecord[] {
  const state = loadState();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return state.tasks.filter(t =>
    t.status === 'completed' &&
    new Date(t.dispatchedAt) > cutoff
  );
}

export function getFailedTasks(days: number): TaskRecord[] {
  const state = loadState();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return state.tasks.filter(t =>
    t.status === 'failed' &&
    new Date(t.dispatchedAt) > cutoff
  );
}

// Sync state with actual Squire task status using @squire/core
export function syncWithSquire(): void {
  const state = loadState();

  for (const task of state.tasks) {
    if (task.status !== 'dispatched') continue;

    const squireTask = getSquireTask(task.taskId);
    if (!squireTask) continue;

    if (squireTask.status === 'completed') {
      task.status = 'completed';
      task.completedAt = squireTask.completedAt || new Date().toISOString();
      if (squireTask.prUrl) task.prUrl = squireTask.prUrl;
    } else if (squireTask.status === 'failed') {
      task.status = 'failed';
      task.completedAt = squireTask.completedAt || new Date().toISOString();
    }
  }

  saveState(state);
}
