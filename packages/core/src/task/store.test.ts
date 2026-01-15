import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createTask,
  getTask,
  updateTask,
  listTasks,
  deleteTask,
  setTasksDir,
  getTasksDir,
} from './store.js';

describe('Task Store', () => {
  let tempDir: string;
  let originalTasksDir: string;

  beforeEach(() => {
    // Save original tasks dir
    originalTasksDir = getTasksDir();
    // Create temp directory for tests
    tempDir = mkdtempSync(join(tmpdir(), 'squire-test-'));
    setTasksDir(tempDir);
  });

  afterEach(() => {
    // Restore original tasks dir
    setTasksDir(originalTasksDir);
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('createTask', () => {
    it('should create a task with required fields', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      assert.ok(task.id, 'Task should have an ID');
      assert.equal(task.repo, 'owner/repo');
      assert.equal(task.prompt, 'Fix the bug');
      assert.equal(task.status, 'pending');
      assert.ok(task.createdAt, 'Task should have createdAt timestamp');
      assert.ok(task.branch?.startsWith('squire/'), 'Branch should be auto-generated');
    });

    it('should use provided branch name', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
        branch: 'custom-branch',
      });

      assert.equal(task.branch, 'custom-branch');
    });

    it('should use provided base branch', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
        baseBranch: 'develop',
      });

      assert.equal(task.baseBranch, 'develop');
    });

    it('should persist task to file system', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const taskPath = join(tempDir, `${task.id}.json`);
      assert.ok(existsSync(taskPath), 'Task file should exist');
    });
  });

  describe('getTask', () => {
    it('should retrieve an existing task', () => {
      const created = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const retrieved = getTask(created.id);

      assert.ok(retrieved, 'Task should be retrieved');
      assert.equal(retrieved!.id, created.id);
      assert.equal(retrieved!.repo, created.repo);
      assert.equal(retrieved!.prompt, created.prompt);
    });

    it('should return null for non-existent task', () => {
      const result = getTask('non-existent-id');
      assert.equal(result, null);
    });
  });

  describe('updateTask', () => {
    it('should update task fields', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const updated = updateTask(task.id, {
        status: 'running',
        containerId: 'container-123',
      });

      assert.ok(updated, 'Task should be updated');
      assert.equal(updated!.status, 'running');
      assert.equal(updated!.containerId, 'container-123');
    });

    it('should preserve existing fields', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const updated = updateTask(task.id, { status: 'completed' });

      assert.equal(updated!.repo, task.repo);
      assert.equal(updated!.prompt, task.prompt);
      assert.equal(updated!.branch, task.branch);
    });

    it('should return null for non-existent task', () => {
      const result = updateTask('non-existent-id', { status: 'completed' });
      assert.equal(result, null);
    });
  });

  describe('listTasks', () => {
    it('should list all tasks', () => {
      createTask({ repo: 'owner/repo1', prompt: 'Task 1' });
      createTask({ repo: 'owner/repo2', prompt: 'Task 2' });
      createTask({ repo: 'owner/repo3', prompt: 'Task 3' });

      const tasks = listTasks();

      assert.equal(tasks.length, 3);
    });

    it('should filter tasks by status', () => {
      const task1 = createTask({ repo: 'owner/repo1', prompt: 'Task 1' });
      createTask({ repo: 'owner/repo2', prompt: 'Task 2' });

      updateTask(task1.id, { status: 'running' });

      const running = listTasks('running');
      const pending = listTasks('pending');

      assert.equal(running.length, 1);
      assert.equal(pending.length, 1);
    });

    it('should return tasks sorted by creation time (newest first)', () => {
      const task1 = createTask({ repo: 'owner/repo1', prompt: 'Task 1' });
      const task2 = createTask({ repo: 'owner/repo2', prompt: 'Task 2' });
      const task3 = createTask({ repo: 'owner/repo3', prompt: 'Task 3' });

      const tasks = listTasks();

      // All tasks should be returned
      assert.equal(tasks.length, 3);
      const taskIds = tasks.map(t => t.id);
      assert.ok(taskIds.includes(task1.id));
      assert.ok(taskIds.includes(task2.id));
      assert.ok(taskIds.includes(task3.id));

      // Verify sort order: each task should have createdAt >= next task's createdAt
      for (let i = 0; i < tasks.length - 1; i++) {
        const current = new Date(tasks[i].createdAt).getTime();
        const next = new Date(tasks[i + 1].createdAt).getTime();
        assert.ok(current >= next, `Task at index ${i} should be newer or equal to task at index ${i + 1}`);
      }
    });

    it('should return empty array when no tasks exist', () => {
      const tasks = listTasks();
      assert.deepEqual(tasks, []);
    });
  });

  describe('deleteTask', () => {
    it('should delete an existing task', () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const deleted = deleteTask(task.id);

      assert.equal(deleted, true);
      assert.equal(getTask(task.id), null);
    });

    it('should return false for non-existent task', () => {
      const result = deleteTask('non-existent-id');
      assert.equal(result, false);
    });
  });

  describe('setTasksDir / getTasksDir', () => {
    it('should get and set tasks directory', () => {
      const newDir = '/custom/tasks/dir';
      setTasksDir(newDir);
      assert.equal(getTasksDir(), newDir);
    });
  });
});
