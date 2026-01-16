import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskStatus, type TaskStatus } from './monitor.js';

describe('Monitor Tasks', () => {
  describe('TaskStatus interface', () => {
    it('should allow valid status values', () => {
      const statuses: TaskStatus[] = [
        { taskId: '1', status: 'running' },
        { taskId: '2', status: 'completed', prUrl: 'url' },
        { taskId: '3', status: 'failed' },
        { taskId: '4', status: 'unknown' },
      ];

      assert.equal(statuses.length, 4);
    });
  });
});
