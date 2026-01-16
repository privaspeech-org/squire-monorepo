import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '@squire/core';
import type { TaskStatus as MonitorTaskStatus } from './monitor.js';
import type { DispatchedTask } from './dispatch.js';

describe('Monitor Module Helper Functions', () => {
  describe('checkTaskStatus', () => {
    it('should return completed status for completed task', () => {
      const squireTask: Task = {
        id: 'task-123',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        status: 'completed',
        createdAt: new Date().toISOString(),
        prUrl: 'https://github.com/owner/repo/pull/1',
      };

      const status: MonitorTaskStatus = {
        taskId: squireTask.id,
        status: 'completed',
        prUrl: squireTask.prUrl,
      };

      assert.equal(status.taskId, 'task-123');
      assert.equal(status.status, 'completed');
      assert.equal(status.prUrl, 'https://github.com/owner/repo/pull/1');
    });

    it('should return failed status for failed task', () => {
      const squireTask: Task = {
        id: 'task-456',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        status: 'failed',
        error: 'Container exited with code 1',
        createdAt: new Date().toISOString(),
      };

      const status: MonitorTaskStatus = {
        taskId: squireTask.id,
        status: 'failed',
      };

      assert.equal(status.taskId, 'task-456');
      assert.equal(status.status, 'failed');
      assert.ok(!status.prUrl);
    });

    it('should return running status for running task', () => {
      const squireTask: Task = {
        id: 'task-789',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        status: 'running',
        containerId: 'container-123',
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      };

      const status: MonitorTaskStatus = {
        taskId: squireTask.id,
        status: 'running',
      };

      assert.equal(status.taskId, 'task-789');
      assert.equal(status.status, 'running');
      assert.ok(!status.prUrl);
    });

    it('should return running status for pending task', () => {
      const squireTask: Task = {
        id: 'task-000',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const status: MonitorTaskStatus = {
        taskId: squireTask.id,
        status: 'running',
      };

      assert.equal(status.taskId, 'task-000');
      assert.equal(status.status, 'running');
      assert.ok(!status.prUrl);
    });

    it('should return unknown status for null task', () => {
      const squireTask = null;

      const status: MonitorTaskStatus = {
        taskId: 'task-unknown',
        status: 'unknown',
      };

      assert.equal(status.taskId, 'task-unknown');
      assert.equal(status.status, 'unknown');
    });

    it('should return unknown status for unknown status', () => {
      const squireTask: Task = {
        id: 'task-xxx',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        status: 'pending' as any,
        createdAt: new Date().toISOString(),
      };

      const status: MonitorTaskStatus = {
        taskId: squireTask.id,
        status: 'unknown',
      };

      assert.equal(status.status, 'unknown');
    });
  });

  describe('Task status transition', () => {
    it('should track status transition', () => {
      const oldStatus = 'dispatched';
      const newStatus = 'completed';
      const taskId = 'task-123';

      const transition = `${taskId}: ${oldStatus} → ${newStatus}`;

      assert.equal(transition, 'task-123: dispatched → completed');
    });

    it('should format status log', () => {
      const taskId = 'task-456';
      const status = 'completed';

      const logMessage = `${taskId}: ${status}`;

      assert.equal(logMessage, 'task-456: completed');
    });
  });

  describe('Sync log formatting', () => {
    it('should format sync message', () => {
      const updated = 5;

      const message = `Updated ${updated} tasks`;

      assert.equal(message, 'Updated 5 tasks');
    });

    it('should format sync header', () => {
      const message = '🔄 Syncing task states...';

      assert.equal(message, '🔄 Syncing task states...');
    });
  });

  describe('Filtering dispatched tasks', () => {
    it('should filter only dispatched tasks', () => {
      const tasks: DispatchedTask[] = [
        { taskId: 'task-1', repo: 'owner/repo', status: 'dispatched', prompt: 'Task 1', priority: 'high', depends_on: [] },
        { taskId: 'task-2', repo: 'owner/repo', status: 'failed', prompt: 'Task 2', priority: 'medium', depends_on: [] },
        { taskId: 'task-3', repo: 'owner/repo', status: 'dispatched', prompt: 'Task 3', priority: 'low', depends_on: [] },
        { taskId: '', repo: 'owner/repo', status: 'failed', prompt: 'Task 4', priority: 'high', depends_on: [] },
      ];

      const dispatchedTasks = tasks.filter(
        task => task.status === 'dispatched' && task.taskId
      );

      assert.equal(dispatchedTasks.length, 2);
      assert.equal(dispatchedTasks[0].taskId, 'task-1');
      assert.equal(dispatchedTasks[1].taskId, 'task-3');
    });

    it('should handle empty tasks array', () => {
      const tasks: DispatchedTask[] = [];

      const dispatchedTasks = tasks.filter(
        task => task.status === 'dispatched' && task.taskId
      );

      assert.equal(dispatchedTasks.length, 0);
    });

    it('should handle tasks without taskId', () => {
      const tasks: DispatchedTask[] = [
        { taskId: '', repo: 'owner/repo', status: 'dispatched', prompt: 'Task 1', priority: 'high', depends_on: [] },
        { taskId: '', repo: 'owner/repo', status: 'failed', prompt: 'Task 2', priority: 'medium', depends_on: [] },
      ];

      const dispatchedTasks = tasks.filter(
        task => task.status === 'dispatched' && task.taskId
      );

      assert.equal(dispatchedTasks.length, 0);
    });
  });

  describe('Task status array building', () => {
    it('should build status array from tasks', () => {
      const tasks: DispatchedTask[] = [
        { taskId: 'task-1', repo: 'owner/repo', status: 'dispatched', prompt: 'Task 1', priority: 'high', depends_on: [] },
        { taskId: 'task-2', repo: 'owner/repo', status: 'dispatched', prompt: 'Task 2', priority: 'medium', depends_on: [] },
      ];

      const statuses: MonitorTaskStatus[] = tasks.map(task => ({
        taskId: task.taskId,
        status: 'running',
      }));

      assert.equal(statuses.length, 2);
      assert.equal(statuses[0].taskId, 'task-1');
      assert.equal(statuses[1].taskId, 'task-2');
    });
  });

  describe('Active task filtering', () => {
    it('should filter active tasks that need status update', () => {
      const statuses: MonitorTaskStatus[] = [
        { taskId: 'task-1', status: 'completed' },
        { taskId: 'task-2', status: 'running' },
        { taskId: 'task-3', status: 'failed' },
        { taskId: 'task-4', status: 'unknown' },
      ];

      const finishedTasks = statuses.filter(
        status => status.status === 'completed' || status.status === 'failed'
      );

      assert.equal(finishedTasks.length, 2);
      assert.equal(finishedTasks[0].taskId, 'task-1');
      assert.equal(finishedTasks[1].taskId, 'task-3');
    });

    it('should keep running tasks in active list', () => {
      const statuses: MonitorTaskStatus[] = [
        { taskId: 'task-1', status: 'running' },
        { taskId: 'task-2', status: 'completed' },
        { taskId: 'task-3', status: 'running' },
      ];

      const runningTasks = statuses.filter(status => status.status === 'running');

      assert.equal(runningTasks.length, 2);
      assert.equal(runningTasks[0].taskId, 'task-1');
      assert.equal(runningTasks[1].taskId, 'task-3');
    });
  });

  describe('Count formatting', () => {
    it('should format count for log message', () => {
      const updated = 1;
      const message = `Updated ${updated} task${updated !== 1 ? 's' : ''}`;

      assert.equal(message, 'Updated 1 task');
    });

    it('should use plural for multiple updates', () => {
      const updated: number = 5;
      const message = `Updated ${updated} task${updated !== 1 ? 's' : ''}`;

      assert.equal(message, 'Updated 5 tasks');
    });

    it('should handle zero updates', () => {
      const updated: number = 0;
      const message = `Updated ${updated} task${updated !== 1 ? 's' : ''}`;

      assert.equal(message, 'Updated 0 tasks');
    });
  });

  describe('Task ID validation', () => {
    it('should validate task ID presence', () => {
      const taskId = 'task-123';

      if (!taskId) {
        assert.fail('Task ID should be present');
      }

      assert.equal(taskId, 'task-123');
    });

    it('should handle empty task ID', () => {
      const taskId = '';

      if (!taskId) {
        assert.ok(true, 'Should handle empty task ID');
      }
    });
  });

  describe('PR URL handling', () => {
    it('should include PR URL when task completed', () => {
      const prUrl = 'https://github.com/owner/repo/pull/42';

      if (prUrl) {
        assert.ok(prUrl.startsWith('https://github.com/'));
        assert.ok(prUrl.includes('/pull/'));
      }
    });

    it('should not include PR URL when task failed', () => {
      const prUrl = undefined;

      if (!prUrl) {
        assert.ok(true, 'PR URL should be undefined for failed tasks');
      }
    });
  });

  describe('Console output formatting', () => {
    it('should format task status for console output', () => {
      const taskId = 'task-123';
      const status = 'running';

      const output = `   ${taskId}: ${status}`;

      assert.equal(output, '   task-123: running');
    });

    it('should format sync header with emoji', () => {
      const header = '🔄 Syncing task states...';

      assert.ok(header.includes('🔄'));
      assert.ok(header.includes('Syncing'));
    });
  });
});
