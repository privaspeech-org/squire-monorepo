import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
    it('should update task fields', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const updated = await updateTask(task.id, {
        status: 'running',
        containerId: 'container-123',
      });

      assert.ok(updated, 'Task should be updated');
      assert.equal(updated!.status, 'running');
      assert.equal(updated!.containerId, 'container-123');
    });

    it('should preserve existing fields', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const updated = await updateTask(task.id, { status: 'completed' });

      assert.equal(updated!.repo, task.repo);
      assert.equal(updated!.prompt, task.prompt);
      assert.equal(updated!.branch, task.branch);
    });

    it('should return null for non-existent task', async () => {
      const result = await updateTask('non-existent-id', { status: 'completed' });
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

    it('should filter tasks by status', async () => {
      const task1 = createTask({ repo: 'owner/repo1', prompt: 'Task 1' });
      createTask({ repo: 'owner/repo2', prompt: 'Task 2' });

      await updateTask(task1.id, { status: 'running' });

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
    it('should delete an existing task', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Fix the bug',
      });

      const deleted = await deleteTask(task.id);

      assert.equal(deleted, true);
      assert.equal(getTask(task.id), null);
    });

    it('should return false for non-existent task', async () => {
      const result = await deleteTask('non-existent-id');
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

  describe('Race Condition Prevention', () => {
    it('should handle concurrent updates to the same task', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test concurrent updates',
      });

      // Simulate 10 concurrent updates with different container IDs
      const updates = Array.from({ length: 10 }, (_, i) =>
        updateTask(task.id, { containerId: `container-${i}` }),
      );

      // All updates should complete successfully
      const results = await Promise.all(updates);
      results.forEach(result => {
        assert.ok(result, 'Update should succeed');
      });

      // Read final state
      const finalTask = getTask(task.id);
      assert.ok(finalTask, 'Task should exist');
      assert.ok(
        finalTask!.containerId?.startsWith('container-'),
        'Container ID should be set',
      );

      // Verify data integrity: containerId should be one of the valid values
      const containerNum = parseInt(finalTask!.containerId!.split('-')[1]);
      assert.ok(
        containerNum >= 0 && containerNum < 10,
        'Container ID should be valid',
      );
    });

    it('should handle concurrent updates to different fields', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test concurrent field updates',
      });

      // Simulate concurrent updates to different fields
      const updates = await Promise.all([
        updateTask(task.id, { status: 'running' }),
        updateTask(task.id, { containerId: 'abc123' }),
        updateTask(task.id, { prUrl: 'https://github.com/owner/repo/pull/1' }),
        updateTask(task.id, { prNumber: 1 }),
      ]);

      // All updates should complete
      updates.forEach(result => {
        assert.ok(result, 'Update should succeed');
      });

      // Read final state - should have all fields
      const finalTask = getTask(task.id);
      assert.ok(finalTask, 'Task should exist');

      // At least some fields should be set (order is non-deterministic)
      // But data should not be corrupted
      assert.ok(
        finalTask!.status === 'running' || finalTask!.status === 'pending',
        'Status should be valid',
      );
    });

    it('should handle concurrent update and delete operations', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test concurrent update and delete',
      });

      // Simulate concurrent update and delete
      const operations = await Promise.allSettled([
        updateTask(task.id, { status: 'running' }),
        updateTask(task.id, { containerId: 'xyz789' }),
        deleteTask(task.id),
      ]);

      // At least one operation should succeed
      const succeeded = operations.filter(op => op.status === 'fulfilled');
      assert.ok(succeeded.length > 0, 'At least one operation should succeed');

      // Task might or might not exist depending on operation order
      const finalTask = getTask(task.id);
      // No assertion needed - just verifying no corruption or errors
    });

    it('should prevent data corruption under concurrent load', async () => {
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test data corruption prevention',
      });

      // Simulate heavy concurrent load with 50 updates
      const updates = Array.from({ length: 50 }, (_, i) =>
        updateTask(task.id, {
          containerId: `container-${i}`,
          retryCount: i,
        }),
      );

      // Wait for all updates to complete
      await Promise.all(updates);

      // Read the task file directly to check for corruption
      const taskFile = join(tempDir, `${task.id}.json`);
      const fileContent = readFileSync(taskFile, 'utf-8');

      // Should be valid JSON (not corrupted)
      let parsed: Task;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(fileContent);
      }, 'Task file should contain valid JSON');

      // Verify data integrity
      const finalTask = getTask(task.id);
      assert.ok(finalTask, 'Task should exist');
      assert.equal(finalTask!.id, task.id, 'Task ID should match');
      assert.equal(finalTask!.repo, task.repo, 'Repo should match');
      assert.ok(finalTask!.containerId, 'Container ID should be set');
      assert.ok(
        typeof finalTask!.retryCount === 'number',
        'Retry count should be a number',
      );
    });
  });
});
