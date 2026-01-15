import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadState,
  saveState,
  recordTask,
  updateTaskStatus,
  getActiveTasks,
  getRecentTasks,
  getFailedTasks,
  type StewardState,
  type TaskRecord,
} from './state.js';

describe('Steward State', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'steward-state-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true });
  });

  describe('loadState', () => {
    it('should return empty state when no file exists', () => {
      const state = loadState();
      assert.deepEqual(state, { tasks: [] });
    });

    it('should load existing state file', () => {
      const existingState: StewardState = {
        tasks: [
          {
            taskId: 'task-1',
            repo: 'owner/repo',
            prompt: 'Test prompt',
            status: 'dispatched',
            dispatchedAt: '2024-01-01T00:00:00Z',
          },
        ],
        lastRun: '2024-01-01T00:00:00Z',
      };
      writeFileSync('./steward-state.json', JSON.stringify(existingState));

      const state = loadState();

      assert.equal(state.tasks.length, 1);
      assert.equal(state.tasks[0].taskId, 'task-1');
    });

    it('should return empty state for invalid JSON', () => {
      writeFileSync('./steward-state.json', '{ invalid json }');

      const state = loadState();

      assert.deepEqual(state, { tasks: [] });
    });
  });

  describe('saveState', () => {
    it('should save state to file', () => {
      const state: StewardState = {
        tasks: [
          {
            taskId: 'task-1',
            repo: 'owner/repo',
            prompt: 'Test prompt',
            status: 'completed',
            dispatchedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T01:00:00Z',
          },
        ],
      };

      saveState(state);

      assert.ok(existsSync('./steward-state.json'));
      const loaded = loadState();
      assert.equal(loaded.tasks[0].taskId, 'task-1');
    });
  });

  describe('recordTask', () => {
    it('should add a new task with timestamp', () => {
      recordTask({
        taskId: 'task-1',
        repo: 'owner/repo',
        prompt: 'Do something',
        status: 'dispatched',
      });

      const state = loadState();

      assert.equal(state.tasks.length, 1);
      assert.equal(state.tasks[0].taskId, 'task-1');
      assert.ok(state.tasks[0].dispatchedAt, 'Should have dispatchedAt');
    });

    it('should append to existing tasks', () => {
      recordTask({ taskId: 'task-1', repo: 'r', prompt: 'p1', status: 'dispatched' });
      recordTask({ taskId: 'task-2', repo: 'r', prompt: 'p2', status: 'dispatched' });

      const state = loadState();

      assert.equal(state.tasks.length, 2);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status to completed', () => {
      recordTask({ taskId: 'task-1', repo: 'r', prompt: 'p', status: 'dispatched' });

      updateTaskStatus('task-1', 'completed', 'https://github.com/owner/repo/pull/1');

      const state = loadState();
      assert.equal(state.tasks[0].status, 'completed');
      assert.equal(state.tasks[0].prUrl, 'https://github.com/owner/repo/pull/1');
      assert.ok(state.tasks[0].completedAt);
    });

    it('should update task status to failed', () => {
      recordTask({ taskId: 'task-1', repo: 'r', prompt: 'p', status: 'dispatched' });

      updateTaskStatus('task-1', 'failed');

      const state = loadState();
      assert.equal(state.tasks[0].status, 'failed');
    });

    it('should not fail for non-existent task', () => {
      updateTaskStatus('non-existent', 'completed');
      // Should not throw
      assert.ok(true);
    });
  });

  describe('getActiveTasks', () => {
    it('should return only dispatched tasks', () => {
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });
      recordTask({ taskId: 't2', repo: 'r', prompt: 'p', status: 'dispatched' });
      updateTaskStatus('t2', 'completed');

      const active = getActiveTasks();

      assert.equal(active.length, 1);
      assert.equal(active[0].taskId, 't1');
    });

    it('should return empty array when no active tasks', () => {
      const active = getActiveTasks();
      assert.deepEqual(active, []);
    });
  });

  describe('getRecentTasks', () => {
    it('should return completed tasks within time window', () => {
      // Record and complete a task
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });
      updateTaskStatus('t1', 'completed');

      const recent = getRecentTasks(7);

      assert.equal(recent.length, 1);
      assert.equal(recent[0].taskId, 't1');
    });

    it('should not include dispatched tasks', () => {
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });

      const recent = getRecentTasks(7);

      assert.equal(recent.length, 0);
    });

    it('should not include failed tasks', () => {
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });
      updateTaskStatus('t1', 'failed');

      const recent = getRecentTasks(7);

      assert.equal(recent.length, 0);
    });
  });

  describe('getFailedTasks', () => {
    it('should return failed tasks within time window', () => {
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });
      updateTaskStatus('t1', 'failed');

      const failed = getFailedTasks(7);

      assert.equal(failed.length, 1);
      assert.equal(failed[0].taskId, 't1');
    });

    it('should not include completed tasks', () => {
      recordTask({ taskId: 't1', repo: 'r', prompt: 'p', status: 'dispatched' });
      updateTaskStatus('t1', 'completed');

      const failed = getFailedTasks(7);

      assert.equal(failed.length, 0);
    });
  });
});
