import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { startWebhookServer } from './server.js';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTask, setTasksDir, getTasksDir, getTask, updateTask } from '@squire/core';

/**
 * Helper to create a valid GitHub webhook signature
 */
function createSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

/**
 * Helper to send a webhook request
 */
async function sendWebhook(
  port: number,
  event: string,
  payload: any,
  secret?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-GitHub-Event': event,
    ...extraHeaders,
  };

  if (secret) {
    headers['X-Hub-Signature-256'] = createSignature(body, secret);
  }

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path: '/webhook',
        method: 'POST',
        headers,
      },
      (res: any) => {
        let responseBody = '';
        res.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: responseBody });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('Webhook Server', () => {
  let server: Server;
  let port: number;
  let tempDir: string;
  let originalTasksDir: string;

  beforeEach(() => {
    // Setup temp task directory
    originalTasksDir = getTasksDir();
    tempDir = mkdtempSync(join(tmpdir(), 'squire-webhook-test-'));
    setTasksDir(tempDir);
  });

  afterEach(() => {
    // Cleanup
    if (server) {
      server.close();
    }
    setTasksDir(originalTasksDir);
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('Server Configuration', () => {
    it('should start server on configured port', (t, done) => {
      server = startWebhookServer({ port: 0 }); // Use random port

      server.on('listening', () => {
        const addr = server.address();
        assert.ok(addr && typeof addr === 'object', 'Server should be listening');
        done();
      });
    });

    it('should enforce webhook secret requirement when configured', () => {
      assert.throws(
        () => {
          server = startWebhookServer({ port: 0, requireSecret: true });
        },
        {
          message: /Webhook secret is required/,
        }
      );
    });

    it('should allow server start without secret when not required', (t, done) => {
      server = startWebhookServer({ port: 0, requireSecret: false });

      server.on('listening', () => {
        assert.ok(true, 'Server should start without secret');
        done();
      });
    });
  });

  describe('Request Routing', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should return 404 for non-webhook paths', async () => {
      return new Promise<void>((resolve) => {
        const req = httpRequest(
          {
            hostname: 'localhost',
            port,
            path: '/not-webhook',
            method: 'POST',
          },
          (res: any) => {
            assert.equal(res.statusCode, 404);
            resolve();
          }
        );
        req.end();
      });
    });

    it('should return 404 for non-POST methods', async () => {
      return new Promise<void>((resolve) => {
        const req = httpRequest(
          {
            hostname: 'localhost',
            port,
            path: '/webhook',
            method: 'GET',
          },
          (res: any) => {
            assert.equal(res.statusCode, 404);
            resolve();
          }
        );
        req.end();
      });
    });
  });

  describe('Signature Verification', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0, secret: 'test-secret' });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should accept valid signature', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload, 'test-secret');
      assert.equal(response.status, 200);
    });

    it('should reject invalid signature', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload, 'wrong-secret');
      assert.equal(response.status, 401);
      assert.match(response.body, /Invalid signature/);
    });

    it('should reject missing signature', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload);
      assert.equal(response.status, 401);
    });
  });

  describe('Payload Validation', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should reject invalid JSON', async () => {
      const response = await new Promise<{ status: number; body: string }>((resolve) => {
        const req = httpRequest(
          {
            hostname: 'localhost',
            port,
            path: '/webhook',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-GitHub-Event': 'pull_request',
            },
          },
          (res: any) => {
            let body = '';
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on('end', () => {
              resolve({ status: res.statusCode, body });
            });
          }
        );

        req.write('invalid json {{{');
        req.end();
      });

      assert.equal(response.status, 400);
      assert.match(response.body, /Invalid JSON/);
    });

    it('should validate pull_request event schema', async () => {
      const invalidPayload = {
        action: 'opened',
        // Missing required pull_request field
      };

      const response = await sendWebhook(port, 'pull_request', invalidPayload);
      assert.equal(response.status, 400);
      assert.match(response.body, /Invalid payload schema/);
    });

    it('should accept valid pull_request payload', async () => {
      const validPayload = {
        action: 'opened',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/1',
          number: 1,
        },
      };

      const response = await sendWebhook(port, 'pull_request', validPayload);
      assert.equal(response.status, 200);
    });

    it('should accept unknown event types', async () => {
      const payload = { some: 'data' };

      const response = await sendWebhook(port, 'unknown_event', payload);
      assert.equal(response.status, 200);
    });
  });

  describe('Pull Request Events', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should handle PR merged event', async () => {
      const prUrl = 'https://github.com/owner/repo/pull/1';
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test task',
      });
      // Simulate task has PR URL
      await updateTask(task.id, { prUrl, status: 'completed' });

      const payload = {
        action: 'closed',
        pull_request: {
          html_url: prUrl,
          number: 1,
          merged: true,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload);
      assert.equal(response.status, 200);

      // Wait a bit for async update
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedTask = getTask(task.id);
      assert.ok(updatedTask, 'Task should exist');
      assert.equal((updatedTask as any).prMerged, true);
      assert.ok((updatedTask as any).prMergedAt, 'Should set prMergedAt timestamp');
    });

    it('should handle PR closed without merge event', async () => {
      const prUrl = 'https://github.com/owner/repo/pull/2';
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test task',
      });
      await updateTask(task.id, { prUrl, status: 'completed' });

      const payload = {
        action: 'closed',
        pull_request: {
          html_url: prUrl,
          number: 2,
          merged: false,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload);
      assert.equal(response.status, 200);

      // Wait a bit for async update
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedTask = getTask(task.id);
      assert.ok(updatedTask, 'Task should exist');
      assert.equal((updatedTask as any).prClosed, true);
      assert.ok((updatedTask as any).prClosedAt, 'Should set prClosedAt timestamp');
    });

    it('should ignore PR events for unknown tasks', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          html_url: 'https://github.com/owner/repo/pull/999',
          number: 999,
          merged: true,
        },
      };

      const response = await sendWebhook(port, 'pull_request', payload);
      assert.equal(response.status, 200);
      // Should not throw or fail
    });
  });

  describe('Issue Comment Events', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should handle PR comment event with callback', async () => {
      let callbackCalled = false;
      let capturedPrUrl = '';
      let capturedComment = '';
      let capturedAuthor = '';

      server.close();
      server = startWebhookServer({
        port: 0,
        onPrComment: (prUrl, taskId, comment, author) => {
          callbackCalled = true;
          capturedPrUrl = prUrl;
          capturedComment = comment;
          capturedAuthor = author;
        },
      });

      await new Promise(resolve => server.on('listening', resolve));
      const addr = server.address();
      port = (addr as any).port;

      const prUrl = 'https://github.com/owner/repo/pull/5';
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test task',
      });
      await updateTask(task.id, { prUrl });

      const payload = {
        action: 'created',
        issue: {
          html_url: prUrl,
          number: 5,
          pull_request: {},
        },
        comment: {
          body: 'Please fix the tests',
          user: {
            login: 'reviewer',
          },
        },
      };

      await sendWebhook(port, 'issue_comment', payload);

      // Wait for callback
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(callbackCalled, 'Callback should be called');
      assert.equal(capturedPrUrl, prUrl);
      assert.equal(capturedComment, 'Please fix the tests');
      assert.equal(capturedAuthor, 'reviewer');
    });

    it('should ignore non-PR issue comments', async () => {
      let callbackCalled = false;

      server.close();
      server = startWebhookServer({
        port: 0,
        onPrComment: () => {
          callbackCalled = true;
        },
      });

      await new Promise(resolve => server.on('listening', resolve));
      const addr = server.address();
      port = (addr as any).port;

      const payload = {
        action: 'created',
        issue: {
          html_url: 'https://github.com/owner/repo/issues/10',
          number: 10,
          // No pull_request field
        },
        comment: {
          body: 'This is an issue comment',
          user: {
            login: 'user',
          },
        },
      };

      await sendWebhook(port, 'issue_comment', payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(!callbackCalled, 'Callback should not be called');
    });
  });

  describe('Check Run Events', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should handle failed CI check', async () => {
      let callbackCalled = false;
      let capturedCheckName = '';

      server.close();
      server = startWebhookServer({
        port: 0,
        onCiFailed: (prUrl, taskId, checkName, logs) => {
          callbackCalled = true;
          capturedCheckName = checkName;
        },
      });

      await new Promise(resolve => server.on('listening', resolve));
      const addr = server.address();
      port = (addr as any).port;

      const prUrl = 'https://github.com/owner/repo/pull/10';
      const task = createTask({
        repo: 'owner/repo',
        prompt: 'Test task',
      });
      await updateTask(task.id, { prUrl, status: 'completed' });

      const payload = {
        action: 'completed',
        check_run: {
          name: 'CI Tests',
          conclusion: 'failure',
          output: {
            summary: 'Tests failed',
            text: 'Error: Expected 1, got 2',
          },
          pull_requests: [{ number: 10 }],
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      await sendWebhook(port, 'check_run', payload);

      // Wait for callback and async update
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(callbackCalled, 'Callback should be called');
      assert.equal(capturedCheckName, 'CI Tests');

      const updatedTask = getTask(task.id);
      assert.ok(updatedTask, 'Task should exist');
      assert.equal((updatedTask as any).ciFailed, true);
      assert.ok((updatedTask as any).ciFailedAt, 'Should set ciFailedAt timestamp');
      assert.equal((updatedTask as any).ciFailedCheck, 'CI Tests');
    });

    it('should ignore successful checks', async () => {
      let callbackCalled = false;

      server.close();
      server = startWebhookServer({
        port: 0,
        onCiFailed: () => {
          callbackCalled = true;
        },
      });

      await new Promise(resolve => server.on('listening', resolve));
      const addr = server.address();
      port = (addr as any).port;

      const payload = {
        action: 'completed',
        check_run: {
          name: 'CI Tests',
          conclusion: 'success',
          pull_requests: [{ number: 12 }],
        },
        repository: {
          full_name: 'owner/repo',
        },
      };

      await sendWebhook(port, 'check_run', payload);
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.ok(!callbackCalled, 'Callback should not be called for successful checks');
    });
  });

  describe('Error Handling', () => {
    beforeEach((t, done) => {
      server = startWebhookServer({ port: 0 });
      server.on('listening', () => {
        const addr = server.address();
        port = (addr as any).port;
        done();
      });
    });

    it('should handle missing event header', async () => {
      const response = await new Promise<{ status: number; body: string }>((resolve) => {
        const req = httpRequest(
          {
            hostname: 'localhost',
            port,
            path: '/webhook',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // No X-GitHub-Event header
            },
          },
          (res: any) => {
            let body = '';
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on('end', () => {
              resolve({ status: res.statusCode, body });
            });
          }
        );

        req.write(JSON.stringify({ test: 'data' }));
        req.end();
      });

      // Should accept it (event will be undefined, treated as unknown event)
      assert.equal(response.status, 200);
    });

    it('should handle empty request body', async () => {
      const response = await new Promise<{ status: number; body: string }>((resolve) => {
        const req = httpRequest(
          {
            hostname: 'localhost',
            port,
            path: '/webhook',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-GitHub-Event': 'pull_request',
            },
          },
          (res: any) => {
            let body = '';
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on('end', () => {
              resolve({ status: res.statusCode, body });
            });
          }
        );

        req.write('');
        req.end();
      });

      assert.equal(response.status, 400);
      assert.match(response.body, /Invalid JSON/);
    });
  });
});
