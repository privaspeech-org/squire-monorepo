import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { listTasks, updateTask, debug, info, warn, createLogger } from '@squire/core';
import { validateWebhookPayload } from './schemas.js';

const logger = createLogger('webhook');

interface ReviewComment {
  path: string;
  line: number | null;
  body: string;
}

interface WebhookConfig {
  port: number;
  secret?: string;
  requireSecret?: boolean; // If true, webhook secret is required (recommended for production)
  autoFixCi?: boolean;
  autoFixReviews?: boolean;
  reviewBotUsers?: string[];
  githubToken?: string;
  onPrMerged?: (prUrl: string, taskId: string) => void;
  onPrClosed?: (prUrl: string, taskId: string) => void;
  onPrComment?: (prUrl: string, taskId: string, comment: string, author: string) => void;
  onCiFailed?: (prUrl: string, taskId: string, checkName: string, logs: string) => void;
  onBotReview?: (prUrl: string, taskId: string, reviewer: string, body: string, comments: ReviewComment[]) => void;
}

/**
 * Find task by PR URL.
 */
function findTaskByPrUrl(prUrl: string) {
  const tasks = listTasks();
  return tasks.find(t => t.prUrl === prUrl);
}

/**
 * Verify GitHub webhook signature.
 */
function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
}

/**
 * Start a webhook server to receive GitHub events.
 */
export function startWebhookServer(config: WebhookConfig): ReturnType<typeof createServer> {
  // Enforce webhook secret requirement if configured
  if (config.requireSecret && !config.secret) {
    throw new Error(
      'Webhook secret is required but not configured. ' +
      'Set config.secret or disable config.requireSecret for development only.'
    );
  }

  // Security audit log for server start
  logger.audit('webhook_server_start', {
    port: config.port,
    secretConfigured: !!config.secret,
    requireSecret: config.requireSecret,
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    debug('webhook', 'Incoming request', {
      requestId,
      method: req.method,
      url: req.url,
      headers: {
        'x-github-event': req.headers['x-github-event'],
        'x-hub-signature-256': req.headers['x-hub-signature-256'] ? '[present]' : '[missing]',
      },
    });

    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString();

    // Verify signature (enforced if requireSecret is true)
    if (config.secret || config.requireSecret) {
      if (!config.secret) {
        logger.audit('webhook_rejected', {
          requestId,
          reason: 'secret_required_but_not_configured',
        });
        warn('webhook', 'Webhook secret required but not configured', { requestId });
        res.writeHead(500);
        res.end('Server configuration error');
        return;
      }

      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifySignature(body, signature, config.secret)) {
        logger.audit('webhook_rejected', {
          requestId,
          reason: 'invalid_signature',
          signaturePresent: !!signature,
        });
        warn('webhook', 'Invalid webhook signature', { requestId });
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }

      // Security audit log for successful authentication
      logger.audit('webhook_authenticated', { requestId });
    } else {
      // Warn if no secret is configured (insecure)
      warn('webhook', 'Webhook received without signature verification (insecure)', { requestId });
    }

    // Parse event
    const event = req.headers['x-github-event'] as string;
    let payload: any;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      logger.audit('webhook_rejected', {
        requestId,
        reason: 'invalid_json',
      });
      warn('webhook', 'Invalid JSON in webhook payload', { requestId });
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    // Validate payload schema
    const validation = validateWebhookPayload(event, payload);
    if (!validation.valid) {
      logger.audit('webhook_rejected', {
        requestId,
        reason: 'schema_validation_failed',
        event,
        error: validation.error,
      });
      warn('webhook', 'Webhook payload validation failed', {
        requestId,
        event,
        error: validation.error,
      });
      res.writeHead(400);
      res.end('Invalid payload schema');
      return;
    }

    // Use validated payload
    payload = validation.data;

    logger.audit('webhook_received', {
      requestId,
      event,
      action: payload.action,
    });

    debug('webhook', 'Processing webhook event', {
      requestId,
      event,
      action: payload.action,
    });

    // Handle pull_request events
    if (event === 'pull_request') {
      const prUrl = payload.pull_request?.html_url;
      const action = payload.action;

      if (prUrl) {
        const task = findTaskByPrUrl(prUrl);

        if (task) {
          if (action === 'closed' && payload.pull_request?.merged) {
            // PR was merged
            await updateTask(task.id, {
              prMerged: true,
              prMergedAt: new Date().toISOString(),
            } as any);
            config.onPrMerged?.(prUrl, task.id);
            info('webhook', 'PR merged', {
              requestId,
              taskId: task.id,
              prUrl,
            });
          } else if (action === 'closed' && !payload.pull_request?.merged) {
            // PR was closed without merging
            await updateTask(task.id, {
              prClosed: true,
              prClosedAt: new Date().toISOString(),
            } as any);
            config.onPrClosed?.(prUrl, task.id);
            info('webhook', 'PR closed', {
              requestId,
              taskId: task.id,
              prUrl,
            });
          } else {
            debug('webhook', 'PR action received', {
              requestId,
              taskId: task.id,
              prUrl,
              action,
            });
          }
        }
      }
    }

    // Handle issue_comment events (PR comments)
    if (event === 'issue_comment' && payload.issue?.pull_request) {
      const prUrl = payload.issue.html_url;
      const comment = payload.comment?.body;
      const author = payload.comment?.user?.login || 'unknown';
      const task = findTaskByPrUrl(prUrl);

      if (task && comment) {
        config.onPrComment?.(prUrl, task.id, comment, author);
        info('webhook', 'PR comment received', {
          requestId,
          taskId: task.id,
          prUrl,
          author,
          commentLength: comment.length,
        });
      }
    }

    // Handle pull_request_review events (formal reviews from bots like Greptile)
    if (event === 'pull_request_review') {
      const prUrl = payload.pull_request?.html_url;
      const reviewer = payload.review?.user?.login || 'unknown';
      const reviewBody = payload.review?.body || '';
      const reviewState = payload.review?.state;
      const task = prUrl ? findTaskByPrUrl(prUrl) : null;

      // Default bot users to respond to
      const botUsers = config.reviewBotUsers || ['greptile[bot]', 'greptile-apps[bot]', 'github-actions[bot]'];
      const isBot = botUsers.some(bot => reviewer.toLowerCase() === bot.toLowerCase());

      if (task && isBot && (reviewState === 'changes_requested' || reviewState === 'commented')) {
        // Fetch inline comments if available
        const comments: ReviewComment[] = [];

        config.onBotReview?.(prUrl, task.id, reviewer, reviewBody, comments);
        info('webhook', 'Bot review received', {
          requestId,
          taskId: task.id,
          prUrl,
          reviewer,
          reviewState,
        });
      }
    }

    // Handle pull_request_review_comment events (inline review comments)
    if (event === 'pull_request_review_comment') {
      const prUrl = payload.pull_request?.html_url;
      const reviewer = payload.comment?.user?.login || 'unknown';
      const commentBody = payload.comment?.body || '';
      const path = payload.comment?.path || '';
      const line = payload.comment?.line || payload.comment?.original_line || null;
      const task = prUrl ? findTaskByPrUrl(prUrl) : null;

      const botUsers = config.reviewBotUsers || ['greptile[bot]', 'greptile-apps[bot]', 'github-actions[bot]'];
      const isBot = botUsers.some(bot => reviewer.toLowerCase() === bot.toLowerCase());

      if (task && isBot && commentBody) {
        const comments: ReviewComment[] = [{ path, line, body: commentBody }];
        config.onBotReview?.(prUrl, task.id, reviewer, '', comments);
        info('webhook', 'Bot inline comment received', {
          requestId,
          taskId: task.id,
          prUrl,
          reviewer,
          path,
          line,
        });
      }
    }

    // Handle check_run events (CI status)
    if (event === 'check_run') {
      const action = payload.action;
      const conclusion = payload.check_run?.conclusion;
      const checkName = payload.check_run?.name;
      const prNumbers = payload.check_run?.pull_requests?.map((pr: any) => pr.number) || [];

      // Only handle completed failed checks
      if (action === 'completed' && (conclusion === 'failure' || conclusion === 'timed_out')) {
        // Find associated task by matching PR
        const repoFullName = payload.repository?.full_name;
        const tasks = listTasks();

        for (const prNumber of prNumbers) {
          const prUrl = `https://github.com/${repoFullName}/pull/${prNumber}`;
          const task = tasks.find(t => t.prUrl === prUrl);

          if (task) {
            // Get check run output/logs
            const output = payload.check_run?.output;
            const summary = output?.summary || '';
            const text = output?.text || '';
            const logs = `${summary}\n\n${text}`.trim() || 'No details available';

            warn('webhook', 'CI check failed', {
              requestId,
              taskId: task.id,
              prUrl,
              checkName,
              conclusion,
            });

            config.onCiFailed?.(prUrl, task.id, checkName || 'Unknown', logs);

            // Update task with CI failure info
            await updateTask(task.id, {
              ciFailed: true,
              ciFailedAt: new Date().toISOString(),
              ciFailedCheck: checkName,
            } as any);
          }
        }
      }
    }

    res.writeHead(200);
    res.end('OK');

    debug('webhook', 'Request completed', { requestId });
  });

  server.listen(config.port, () => {
    info('webhook', 'Webhook server started', {
      port: config.port,
    });
  });

  return server;
}
