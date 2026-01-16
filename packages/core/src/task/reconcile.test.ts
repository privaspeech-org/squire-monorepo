/**
 * Task Reconciliation Tests
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  reconcileTasks,
  needsReconciliation,
  reconcileOnce,
  resetReconcileFlag,
  type ReconcileResult,
} from './reconcile.js';
import { setTasksDir, createTask, updateTask, getTask, listTasks } from './store.js';
import { setBackend, resetBackend } from '../worker/backend.js';
import type { WorkerBackend, WorkerTaskInfo } from '../worker/types.js';

describe('reconcileTasks', () => {
  let tempDir: string;
  let mockBackend: WorkerBackend;
  let mockWorkers: WorkerTaskInfo[];

  beforeEach(() => {
    // Create temp directory for task storage
    tempDir = mkdtempSync(join(tmpdir(), 'reconcile-test-'));
    setTasksDir(tempDir);
    resetReconcileFlag();

    // Initialize mock workers list
    mockWorkers = [];

    // Create mock backend
    mockBackend = {
      name: 'docker' as const,
      startTask: mock.fn(async () => 'mock-container-id'),
      getTaskLogs: mock.fn(async () => 'mock logs'),
      isTaskRunning: mock.fn(async () => true),
      getTaskExitCode: mock.fn(async () => null),
      stopTask: mock.fn(async () => {}),
      removeTask: mock.fn(async () => {}),
      listTasks: mock.fn(async () => mockWorkers),
    };

    setBackend(mockBackend);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    resetBackend();
  });

  it('should mark running task as failed when no worker exists', async () => {
    // Create a task marked as running
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'missing-container' });

    // Mock backend returns no workers
    mockWorkers = [];

    const result = await reconcileTasks();

    assert.equal(result.tasksReconciled, 1);
    assert.equal(result.tasksMarkedFailed, 1);
    assert.equal(result.errors.length, 0);

    const updated = getTask(task.id);
    assert.equal(updated?.status, 'failed');
    assert.ok(updated?.error?.includes('not found'));
  });

  it('should update task status when worker completed successfully', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    // Mock worker completed successfully
    mockWorkers = [{
      taskId: task.id,
      workerId: 'test-container',
      running: false,
      exitCode: 0,
    }];

    const result = await reconcileTasks();

    assert.equal(result.tasksReconciled, 1);
    assert.equal(result.tasksMarkedCompleted, 1);
    assert.equal(result.tasksMarkedFailed, 0);

    const updated = getTask(task.id);
    assert.equal(updated?.status, 'completed');
  });

  it('should update task status when worker failed', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    // Mock worker failed
    mockWorkers = [{
      taskId: task.id,
      workerId: 'test-container',
      running: false,
      exitCode: 1,
    }];

    const result = await reconcileTasks();

    assert.equal(result.tasksReconciled, 1);
    assert.equal(result.tasksMarkedFailed, 1);

    const updated = getTask(task.id);
    assert.equal(updated?.status, 'failed');
    assert.ok(updated?.error?.includes('exit'));
  });

  it('should not change task when worker is still running', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    // Mock worker still running
    mockWorkers = [{
      taskId: task.id,
      workerId: 'test-container',
      running: true,
      exitCode: null,
    }];

    const result = await reconcileTasks();

    assert.equal(result.tasksReconciled, 1);
    assert.equal(result.tasksMarkedCompleted, 0);
    assert.equal(result.tasksMarkedFailed, 0);

    const updated = getTask(task.id);
    assert.equal(updated?.status, 'running');
  });

  it('should remove orphaned workers with no task file', async () => {
    // No tasks in store, but backend has a worker
    mockWorkers = [{
      taskId: 'non-existent-task',
      workerId: 'orphan-container',
      running: false,
      exitCode: 0,
    }];

    const result = await reconcileTasks({ removeOrphanedWorkers: true });

    assert.equal(result.orphanedWorkersRemoved, 1);
    // Verify removeTask was called
    const removeTaskMock = mockBackend.removeTask as unknown as { mock: { calls: unknown[][] } };
    assert.ok(removeTaskMock.mock.calls.length > 0);
  });

  it('should not remove workers in dry run mode', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    // Worker not found
    mockWorkers = [];

    const result = await reconcileTasks({ dryRun: true });

    assert.equal(result.tasksMarkedFailed, 1);

    // Task should NOT be updated in dry run
    const updated = getTask(task.id);
    assert.equal(updated?.status, 'running');
  });

  it('should handle multiple tasks', async () => {
    // Create multiple tasks in different states
    const task1 = createTask({ repo: 'owner/repo1', prompt: 'test1' });
    await updateTask(task1.id, { status: 'running', containerId: 'container-1' });

    const task2 = createTask({ repo: 'owner/repo2', prompt: 'test2' });
    await updateTask(task2.id, { status: 'running', containerId: 'container-2' });

    const task3 = createTask({ repo: 'owner/repo3', prompt: 'test3' });
    await updateTask(task3.id, { status: 'running', containerId: 'container-3' });

    // Mock different worker states
    mockWorkers = [
      { taskId: task1.id, workerId: 'container-1', running: true, exitCode: null },  // Still running
      { taskId: task2.id, workerId: 'container-2', running: false, exitCode: 0 },    // Completed
      // task3 has no worker (orphaned)
    ];

    const result = await reconcileTasks();

    assert.equal(result.tasksReconciled, 3);
    assert.equal(result.tasksMarkedCompleted, 1);
    assert.equal(result.tasksMarkedFailed, 1);

    assert.equal(getTask(task1.id)?.status, 'running');
    assert.equal(getTask(task2.id)?.status, 'completed');
    assert.equal(getTask(task3.id)?.status, 'failed');
  });

  it('should skip non-running tasks', async () => {
    const pendingTask = createTask({ repo: 'owner/repo1', prompt: 'pending' });
    // Stays pending

    const completedTask = createTask({ repo: 'owner/repo2', prompt: 'completed' });
    await updateTask(completedTask.id, { status: 'completed' });

    mockWorkers = [];

    const result = await reconcileTasks();

    // No running tasks to reconcile
    assert.equal(result.tasksReconciled, 0);
    assert.equal(result.tasksMarkedFailed, 0);
    assert.equal(result.tasksMarkedCompleted, 0);
  });
});

describe('needsReconciliation', () => {
  let tempDir: string;
  let mockBackend: WorkerBackend;
  let mockWorkers: WorkerTaskInfo[];

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reconcile-needs-test-'));
    setTasksDir(tempDir);

    mockWorkers = [];
    mockBackend = {
      name: 'docker' as const,
      startTask: mock.fn(async () => ''),
      getTaskLogs: mock.fn(async () => ''),
      isTaskRunning: mock.fn(async () => true),
      getTaskExitCode: mock.fn(async () => null),
      stopTask: mock.fn(async () => {}),
      removeTask: mock.fn(async () => {}),
      listTasks: mock.fn(async () => mockWorkers),
    };

    setBackend(mockBackend);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    resetBackend();
  });

  it('should return false when no running tasks', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    // Task stays pending

    const needs = await needsReconciliation();
    assert.equal(needs, false);
  });

  it('should return true when running task has no worker', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'missing' });

    mockWorkers = [];

    const needs = await needsReconciliation();
    assert.equal(needs, true);
  });

  it('should return true when worker completed but task still running', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    mockWorkers = [{
      taskId: task.id,
      workerId: 'test-container',
      running: false,
      exitCode: 0,
    }];

    const needs = await needsReconciliation();
    assert.equal(needs, true);
  });

  it('should return false when running task has running worker', async () => {
    const task = createTask({ repo: 'owner/repo', prompt: 'test' });
    await updateTask(task.id, { status: 'running', containerId: 'test-container' });

    mockWorkers = [{
      taskId: task.id,
      workerId: 'test-container',
      running: true,
      exitCode: null,
    }];

    const needs = await needsReconciliation();
    assert.equal(needs, false);
  });
});

describe('reconcileOnce', () => {
  let tempDir: string;
  let mockBackend: WorkerBackend;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reconcile-once-test-'));
    setTasksDir(tempDir);
    resetReconcileFlag();

    mockBackend = {
      name: 'docker' as const,
      startTask: mock.fn(async () => ''),
      getTaskLogs: mock.fn(async () => ''),
      isTaskRunning: mock.fn(async () => true),
      getTaskExitCode: mock.fn(async () => null),
      stopTask: mock.fn(async () => {}),
      removeTask: mock.fn(async () => {}),
      listTasks: mock.fn(async () => []),
    };

    setBackend(mockBackend);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    resetBackend();
    resetReconcileFlag();
  });

  it('should only run once per process', async () => {
    const result1 = await reconcileOnce();
    const result2 = await reconcileOnce();

    assert.ok(result1 !== null);
    assert.equal(result2, null);
  });

  it('should run again after reset', async () => {
    const result1 = await reconcileOnce();
    assert.ok(result1 !== null);

    resetReconcileFlag();

    const result2 = await reconcileOnce();
    assert.ok(result2 !== null);
  });
});
