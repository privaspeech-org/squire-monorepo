import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTask, updateTask, listTasks, setTasksDir, getTasksDir } from './store.js';
import { countRunningTasks, canStartNewTask, waitForSlot } from './limits.js';

describe('Task Limits', () => {
  let tempDir: string;
  let originalTasksDir: string;

  beforeEach(() => {
    originalTasksDir = getTasksDir();
    tempDir = mkdtempSync(join(tmpdir(), 'squire-limits-test-'));
    setTasksDir(tempDir);
  });

  afterEach(() => {
    setTasksDir(originalTasksDir);
    if (tempDir) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('countRunningTasks', () => {
    it('should return 0 when no tasks exist', async () => {
      const count = await countRunningTasks();
      assert.equal(count, 0);
    });

    it('should return 0 when only pending tasks exist', async () => {
      createTask({ repo: 'owner/repo', prompt: 'Task 1' });
      createTask({ repo: 'owner/repo', prompt: 'Task 2' });

      const count = await countRunningTasks();
      assert.equal(count, 0);
    });

    it('should not count tasks without container ID', async () => {
      const task = createTask({ repo: 'owner/repo', prompt: 'Task 1' });
      updateTask(task.id, { status: 'running' });

      await countRunningTasks();

      const updated = listTasks().find(t => t.id === task.id);
      assert.equal(updated?.status, 'failed');
      assert.equal(updated?.error, 'No container ID');
    });
  });

  describe('canStartNewTask', () => {
    it('should allow starting a task when under limit', async () => {
      const result = await canStartNewTask(5);
      assert.equal(result.allowed, true);
      assert.equal(result.running, 0);
      assert.equal(result.max, 5);
    });

    it('should use default maxConcurrent of 5', async () => {
      const result = await canStartNewTask();
      assert.equal(result.max, 5);
    });
  });

  describe('waitForSlot', () => {
    it('should return immediately when slot available', async () => {
      await waitForSlot(5, 100);
    });

    it('should use default parameters', async () => {
      await waitForSlot();
    });
  });
});
