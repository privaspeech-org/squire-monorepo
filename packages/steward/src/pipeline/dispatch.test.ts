import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DispatchedTask } from './dispatch.js';

describe('Dispatch Tasks', () => {
  describe('DispatchedTask interface', () => {
    it('should support valid task properties', () => {
      const task: DispatchedTask = {
        prompt: 'Fix bug',
        priority: 'high',
        depends_on: [],
        taskId: 'task-123',
        repo: 'owner/repo',
        status: 'dispatched',
      };

      assert.equal(task.taskId, 'task-123');
      assert.equal(task.status, 'dispatched');
    });

    it('should support failed task status', () => {
      const task: DispatchedTask = {
        prompt: 'Fix bug',
        priority: 'high',
        depends_on: [],
        taskId: '',
        repo: 'owner/repo',
        status: 'failed',
      };

      assert.equal(task.status, 'failed');
      assert.equal(task.taskId, '');
    });

    it('should support all priority levels', () => {
      const tasks: DispatchedTask[] = [
        {
          prompt: 'Task 1',
          priority: 'high',
          depends_on: [],
          taskId: 'task-1',
          repo: 'owner/repo',
          status: 'dispatched',
        },
        {
          prompt: 'Task 2',
          priority: 'medium',
          depends_on: [],
          taskId: 'task-2',
          repo: 'owner/repo',
          status: 'dispatched',
        },
        {
          prompt: 'Task 3',
          priority: 'low',
          depends_on: [],
          taskId: 'task-3',
          repo: 'owner/repo',
          status: 'dispatched',
        },
      ];

      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].priority, 'high');
      assert.equal(tasks[1].priority, 'medium');
      assert.equal(tasks[2].priority, 'low');
    });
  });
});
