import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import type { Task, TaskCreateOptions, TaskStatus } from './types.js';

const TASKS_DIR = process.env.SQUIRE_TASKS_DIR || join(process.cwd(), 'tasks');

function ensureTasksDir(): void {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true });
  }
}

function taskPath(id: string): string {
  return join(TASKS_DIR, `${id}.json`);
}

export function createTask(options: TaskCreateOptions): Task {
  ensureTasksDir();
  
  const id = nanoid(10);
  const task: Task = {
    id,
    repo: options.repo,
    prompt: options.prompt,
    branch: options.branch || `squire/${id}`,
    baseBranch: options.baseBranch || 'auto',  // Auto-detect default branch
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  writeFileSync(taskPath(id), JSON.stringify(task, null, 2));
  return task;
}

export function getTask(id: string): Task | null {
  const path = taskPath(id);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const task = getTask(id);
  if (!task) {
    return null;
  }
  
  const updated = { ...task, ...updates };
  writeFileSync(taskPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export function listTasks(status?: TaskStatus): Task[] {
  ensureTasksDir();
  
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
  const tasks: Task[] = files.map(f => {
    const content = readFileSync(join(TASKS_DIR, f), 'utf-8');
    return JSON.parse(content);
  });
  
  if (status) {
    return tasks.filter(t => t.status === status);
  }
  
  // Sort by createdAt descending (newest first)
  return tasks.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function deleteTask(id: string): boolean {
  const path = taskPath(id);
  if (!existsSync(path)) {
    return false;
  }
  unlinkSync(path);
  return true;
}
