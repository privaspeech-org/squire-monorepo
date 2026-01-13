import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { listTasks, updateTask } from '../task/store.js';

interface WebhookConfig {
  port: number;
  secret?: string;
  autoFixCi?: boolean;  // Auto-create follow-up on CI failure
  githubToken?: string; // Needed for auto-fix
  onPrMerged?: (prUrl: string, taskId: string) => void;
  onPrClosed?: (prUrl: string, taskId: string) => void;
  onPrComment?: (prUrl: string, taskId: string, comment: string) => void;
  onCiFailed?: (prUrl: string, taskId: string, checkName: string, logs: string) => void;
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
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
    
    // Verify signature if secret is configured
    if (config.secret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifySignature(body, signature, config.secret)) {
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }
    }
    
    // Parse event
    const event = req.headers['x-github-event'] as string;
    let payload: any;
    
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }
    
    // Handle pull_request events
    if (event === 'pull_request') {
      const prUrl = payload.pull_request?.html_url;
      const action = payload.action;
      
      if (prUrl) {
        const task = findTaskByPrUrl(prUrl);
        
        if (task) {
          if (action === 'closed' && payload.pull_request?.merged) {
            // PR was merged
            updateTask(task.id, { 
              prMerged: true,
              prMergedAt: new Date().toISOString(),
            } as any);
            config.onPrMerged?.(prUrl, task.id);
            console.log(`[webhook] PR merged: ${prUrl} (task: ${task.id})`);
          } else if (action === 'closed' && !payload.pull_request?.merged) {
            // PR was closed without merging
            updateTask(task.id, { 
              prClosed: true,
              prClosedAt: new Date().toISOString(),
            } as any);
            config.onPrClosed?.(prUrl, task.id);
            console.log(`[webhook] PR closed: ${prUrl} (task: ${task.id})`);
          }
        }
      }
    }
    
    // Handle issue_comment events (PR comments)
    if (event === 'issue_comment' && payload.issue?.pull_request) {
      const prUrl = payload.issue.html_url;
      const comment = payload.comment?.body;
      const task = findTaskByPrUrl(prUrl);
      
      if (task && comment) {
        config.onPrComment?.(prUrl, task.id, comment);
        console.log(`[webhook] PR comment on ${prUrl}: ${comment.slice(0, 50)}...`);
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
            
            console.log(`[webhook] CI failed on ${prUrl}: ${checkName}`);
            config.onCiFailed?.(prUrl, task.id, checkName || 'Unknown', logs);
            
            // Update task with CI failure info
            updateTask(task.id, {
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
  });
  
  server.listen(config.port, () => {
    console.log(`Webhook server listening on port ${config.port}`);
  });
  
  return server;
}
