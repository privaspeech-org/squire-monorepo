import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pullRequestEventSchema,
  issueCommentEventSchema,
  pullRequestReviewEventSchema,
  pullRequestReviewCommentEventSchema,
  checkRunEventSchema,
  validateWebhookPayload,
  webhookSchemas,
} from './schemas.js';

describe('Webhook Schemas', () => {
  describe('pullRequestEventSchema', () => {
    it('should validate a valid pull_request event', () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
          merged: false,
          state: 'open',
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      const result = pullRequestEventSchema.safeParse(payload);
      assert.ok(result.success, 'Valid payload should pass validation');
      if (result.success) {
        assert.equal(result.data.action, 'opened');
        assert.equal(result.data.pull_request.number, 1);
      }
    });

    it('should reject invalid pull_request event', () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'not-a-url',
          number: 'not-a-number',
        },
      };

      const result = pullRequestEventSchema.safeParse(payload);
      assert.ok(!result.success, 'Invalid payload should fail validation');
    });
  });

  describe('issueCommentEventSchema', () => {
    it('should validate a valid issue_comment event', () => {
      const payload = {
        action: 'created',
        issue: {
          html_url: 'https://github.com/owner/repo/issues/1',
          number: 1,
          pull_request: {},
        },
        comment: {
          body: 'Please review this',
          user: {
            login: 'octocat',
          },
        },
      };

      const result = issueCommentEventSchema.safeParse(payload);
      assert.ok(result.success, 'Valid payload should pass validation');
      if (result.success) {
        assert.equal(result.data.action, 'created');
        assert.equal(result.data.comment.user.login, 'octocat');
      }
    });

    it('should reject invalid issue_comment event', () => {
      const payload = {
        action: 'created',
        issue: {
          html_url: 'not-a-url',
        },
        comment: {
          body: 'comment',
        },
      };

      const result = issueCommentEventSchema.safeParse(payload);
      assert.ok(!result.success, 'Invalid payload should fail validation');
    });
  });

  describe('pullRequestReviewEventSchema', () => {
    it('should validate a valid pull_request_review event', () => {
      const payload = {
        action: 'submitted',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
        review: {
          user: {
            login: 'octocat',
          },
          body: 'Looks good!',
          state: 'approved',
        },
      };

      const result = pullRequestReviewEventSchema.safeParse(payload);
      assert.ok(result.success, 'Valid payload should pass validation');
      if (result.success) {
        assert.equal(result.data.review.state, 'approved');
      }
    });

    it('should allow optional review body', () => {
      const payload = {
        action: 'submitted',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
        review: {
          user: {
            login: 'octocat',
          },
          state: 'approved',
        },
      };

      const result = pullRequestReviewEventSchema.safeParse(payload);
      assert.ok(result.success, 'Payload without body should pass validation');
    });
  });

  describe('pullRequestReviewCommentEventSchema', () => {
    it('should validate a valid pull_request_review_comment event', () => {
      const payload = {
        action: 'created',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
        comment: {
          body: 'Please fix this line',
          user: {
            login: 'octocat',
          },
          path: 'src/index.ts',
          line: 42,
          original_line: 42,
        },
      };

      const result = pullRequestReviewCommentEventSchema.safeParse(payload);
      assert.ok(result.success, 'Valid payload should pass validation');
      if (result.success) {
        assert.equal(result.data.comment.line, 42);
        assert.equal(result.data.comment.path, 'src/index.ts');
      }
    });

    it('should allow optional comment fields', () => {
      const payload = {
        action: 'created',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
        comment: {
          body: 'General comment',
          user: {
            login: 'octocat',
          },
        },
      };

      const result = pullRequestReviewCommentEventSchema.safeParse(payload);
      assert.ok(result.success, 'Payload without path/line should pass validation');
    });
  });

  describe('checkRunEventSchema', () => {
    it('should validate a valid check_run event', () => {
      const payload = {
        action: 'completed',
        check_run: {
          name: 'tests',
          conclusion: 'failure',
          output: {
            summary: '2 tests failed',
            text: 'Failed tests...',
          },
          pull_requests: [
            { number: 1 },
          ],
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      const result = checkRunEventSchema.safeParse(payload);
      assert.ok(result.success, 'Valid payload should pass validation');
      if (result.success) {
        assert.equal(result.data.check_run.conclusion, 'failure');
        assert.equal(result.data.check_run.pull_requests?.[0].number, 1);
      }
    });

    it('should allow optional check_run fields', () => {
      const payload = {
        action: 'created',
        check_run: {
          name: 'tests',
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      const result = checkRunEventSchema.safeParse(payload);
      assert.ok(result.success, 'Payload without optional fields should pass validation');
    });
  });

  describe('webhookSchemas', () => {
    it('should contain all expected event types', () => {
      const expectedEvents = [
        'pull_request',
        'issue_comment',
        'pull_request_review',
        'pull_request_review_comment',
        'check_run',
      ];

      for (const event of expectedEvents) {
        assert.ok(webhookSchemas[event as keyof typeof webhookSchemas], `${event} schema should exist`);
      }
    });
  });

  describe('validateWebhookPayload', () => {
    it('should validate valid payloads', () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
      };

      const result = validateWebhookPayload('pull_request', payload);
      assert.ok(result.valid, 'Valid payload should pass');
      if (result.valid) {
        assert.ok(result.data, 'Data should be returned');
      }
    });

    it('should return error for invalid payloads', () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'not-a-url',
        },
      };

      const result = validateWebhookPayload('pull_request', payload);
      assert.ok(!result.valid, 'Invalid payload should fail');
      if (!result.valid) {
        assert.ok(result.error, 'Error message should be returned');
        assert.ok(result.error.includes('Schema validation failed'), 'Error should mention validation failure');
      }
    });

    it('should allow unknown event types', () => {
      const payload = { some: 'data' };
      const result = validateWebhookPayload('unknown_event', payload);

      assert.ok(result.valid, 'Unknown event type should be allowed');
    });

    it('should handle issue_comment events', () => {
      const payload = {
        action: 'created',
        issue: {
          html_url: 'https://github.com/owner/repo/issues/1',
          number: 1,
        },
        comment: {
          body: 'comment',
          user: { login: 'user' },
        },
      };

      const result = validateWebhookPayload('issue_comment', payload);
      assert.ok(result.valid, 'Valid issue_comment should pass');
    });

    it('should handle check_run events', () => {
      const payload = {
        action: 'completed',
        check_run: {
          name: 'tests',
          conclusion: 'success',
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      const result = validateWebhookPayload('check_run', payload);
      assert.ok(result.valid, 'Valid check_run should pass');
    });

    it('should handle null and undefined gracefully', () => {
      const result = validateWebhookPayload('pull_request', null);
      assert.ok(!result.valid, 'Null payload should fail');

      const result2 = validateWebhookPayload('pull_request', undefined);
      assert.ok(!result.valid, 'Undefined payload should fail');
    });

    it('should return structured error for Zod validation errors', () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 'not-a-number',
        },
      };

      const result = validateWebhookPayload('pull_request', payload);
      assert.ok(!result.valid, 'Invalid payload should fail');
      if (!result.valid) {
        assert.ok(
          result.error.includes('pull_request') || result.error.includes('number'),
          'Error should indicate which field failed'
        );
      }
    });
  });
});
