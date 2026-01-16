import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateTaskArray,
  formatValidationErrors,
  TASK_EXAMPLES,
  getSchemaDescription,
} from './task-schema.js';

describe('Task Schema Validation', () => {
  const validTaskResponse = [
    {
      prompt: 'Fix failing CI build in packages/core',
      priority: 'high' as const,
      depends_on: [],
    },
    {
      prompt: 'Update documentation for new features',
      priority: 'low' as const,
      depends_on: [],
    },
  ];

  describe('validateTaskArray', () => {
    it('should validate valid task array', () => {
      const result = validateTaskArray(validTaskResponse);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 2);
        assert.strictEqual(result.data[0].prompt, 'Fix failing CI build in packages/core');
        assert.strictEqual(result.data[0].priority, 'high');
        assert.deepStrictEqual(result.data[0].depends_on, []);
      }
    });

    it('should reject task with invalid priority', () => {
      const invalid = [
        {
          prompt: 'Test task',
          priority: 'urgent', // Invalid
          depends_on: [],
        },
      ];

      const result = validateTaskArray(invalid);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.errors.length > 0);
        // Check that error relates to priority field
        assert.ok(result.errors.some(err => err.path.includes('priority')));
      }
    });

    it('should reject task with short prompt', () => {
      const invalid = [
        {
          prompt: 'Short', // Too short (<10 chars)
          priority: 'medium',
          depends_on: [],
        },
      ];

      const result = validateTaskArray(invalid);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.errors[0].message.includes('at least 10 characters'));
      }
    });

    it('should reject task with excessively long prompt', () => {
      const invalid = [
        {
          prompt: 'x'.repeat(2001), // Too long (>2000 chars)
          priority: 'medium',
          depends_on: [],
        },
      ];

      const result = validateTaskArray(invalid);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.errors[0].message.includes('not exceed 2000 characters'));
      }
    });

    it('should apply default empty array for depends_on', () => {
      const taskWithoutDependsOn = [
        {
          prompt: 'Test task without depends_on field',
          priority: 'medium' as const,
        },
      ];

      const result = validateTaskArray(taskWithoutDependsOn);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.deepStrictEqual(result.data[0].depends_on, []);
      }
    });

    it('should reject non-array input', () => {
      const invalid = {
        prompt: 'This is not an array',
        priority: 'high',
      };

      const result = validateTaskArray(invalid);

      assert.strictEqual(result.success, false);
    });

    it('should validate empty array', () => {
      const result = validateTaskArray([]);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 0);
      }
    });

    it('should validate task with dependencies', () => {
      const tasksWithDeps = [
        {
          prompt: 'Task that depends on others',
          priority: 'medium' as const,
          depends_on: ['task-123', 'task-456'],
        },
      ];

      const result = validateTaskArray(tasksWithDeps);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.deepStrictEqual(result.data[0].depends_on, ['task-123', 'task-456']);
      }
    });

    it('should reject task with non-string dependencies', () => {
      const invalid = [
        {
          prompt: 'Task with invalid depends_on',
          priority: 'medium',
          depends_on: [123, 456], // Should be strings
        },
      ];

      const result = validateTaskArray(invalid);

      assert.strictEqual(result.success, false);
    });

    it('should validate all priority levels', () => {
      const allPriorities = [
        { prompt: 'High priority task', priority: 'high' as const, depends_on: [] },
        { prompt: 'Medium priority task', priority: 'medium' as const, depends_on: [] },
        { prompt: 'Low priority task', priority: 'low' as const, depends_on: [] },
      ];

      const result = validateTaskArray(allPriorities);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 3);
        assert.strictEqual(result.data[0].priority, 'high');
        assert.strictEqual(result.data[1].priority, 'medium');
        assert.strictEqual(result.data[2].priority, 'low');
      }
    });
  });

  describe('formatValidationErrors', () => {
    it('should format validation errors correctly', () => {
      const errors = [
        {
          message: 'Invalid enum value',
          path: ['0', 'priority'],
          received: 'urgent',
        },
        {
          message: 'String must contain at least 10 characters',
          path: ['1', 'prompt'],
          received: 'short',
        },
      ];

      const formatted = formatValidationErrors(errors);

      assert.ok(formatted.includes('Invalid enum value at 0.priority'));
      assert.ok(formatted.includes('String must contain at least 10 characters at 1.prompt'));
    });

    it('should handle empty errors array', () => {
      const formatted = formatValidationErrors([]);

      assert.strictEqual(formatted, 'Unknown validation error');
    });

    it('should handle errors without path', () => {
      const errors = [
        {
          message: 'General error',
          path: [],
          received: null,
        },
      ];

      const formatted = formatValidationErrors(errors);

      assert.ok(formatted.includes('General error'));
      assert.ok(!formatted.includes(' at ')); // No path suffix
    });
  });

  describe('TASK_EXAMPLES', () => {
    it('should have valid example tasks', () => {
      assert.ok(Array.isArray(TASK_EXAMPLES));
      assert.ok(TASK_EXAMPLES.length > 0);

      const result = validateTaskArray(TASK_EXAMPLES);

      assert.strictEqual(result.success, true, 'Example tasks should be valid');
    });

    it('should include examples for all priority levels', () => {
      const priorities = TASK_EXAMPLES.map(t => t.priority);

      assert.ok(priorities.includes('high'), 'Should have high priority example');
      assert.ok(priorities.includes('medium'), 'Should have medium priority example');
      assert.ok(priorities.includes('low'), 'Should have low priority example');
    });
  });

  describe('getSchemaDescription', () => {
    it('should return JSON schema string', () => {
      const schema = getSchemaDescription();

      assert.ok(typeof schema === 'string');
      assert.ok(schema.includes('"type"'));
      assert.ok(schema.includes('"array"'));
      assert.ok(schema.includes('"prompt"'));
      assert.ok(schema.includes('"priority"'));
      assert.ok(schema.includes('"depends_on"'));
    });

    it('should include minLength and maxLength constraints', () => {
      const schema = getSchemaDescription();

      assert.ok(schema.includes('minLength'));
      assert.ok(schema.includes('maxLength'));
      assert.ok(schema.includes('2000'));
    });

    it('should include enum values for priority', () => {
      const schema = getSchemaDescription();

      assert.ok(schema.includes('high'));
      assert.ok(schema.includes('medium'));
      assert.ok(schema.includes('low'));
    });
  });
});
