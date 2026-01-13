import { Command } from 'commander';
import chalk from 'chalk';
import { startWebhookServer } from '../webhook/server.js';
import { getTask, createTask, updateTask } from '../task/store.js';
import { startTaskContainer } from '../worker/container.js';
import { getConfig } from '../config.js';

export const webhookCommand = new Command('webhook')
  .description('Start webhook server to receive GitHub events')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-s, --secret <secret>', 'Webhook secret (or JULES_WEBHOOK_SECRET env)')
  .option('--auto-fix-ci', 'Auto-create follow-up tasks when CI fails')
  .option('--auto-fix-reviews', 'Auto-create follow-up tasks from bot review comments (e.g., Greptile)')
  .option('--review-bots <bots>', 'Comma-separated bot usernames to respond to', 'greptile[bot]')
  .action(async (options) => {
    const config = getConfig();
    const port = parseInt(options.port, 10);
    const secret = options.secret || process.env.JULES_WEBHOOK_SECRET;
    const autoFixCi = options.autoFixCi;
    const autoFixReviews = options.autoFixReviews;
    const reviewBots = options.reviewBots?.split(',').map((b: string) => b.trim()) || ['greptile[bot]'];
    
    console.log(chalk.bold('Starting webhook server...\n'));
    
    if (!secret) {
      console.log(chalk.yellow('⚠ No webhook secret configured'));
      console.log(chalk.dim('  Set via --secret or JULES_WEBHOOK_SECRET\n'));
    }
    
    if ((autoFixCi || autoFixReviews) && !config.githubToken) {
      console.log(chalk.yellow('⚠ Auto-fix features require GITHUB_TOKEN'));
      console.log(chalk.dim('  Set via environment or jules config\n'));
    }
    
    if (autoFixCi) {
      console.log(chalk.green('✓ Auto-fix CI enabled'));
      console.log(chalk.dim('  Will create follow-up tasks when CI fails\n'));
    }
    
    if (autoFixReviews) {
      console.log(chalk.green('✓ Auto-fix reviews enabled'));
      console.log(chalk.dim(`  Responding to: ${reviewBots.join(', ')}\n`));
    }
    
    startWebhookServer({
      port,
      secret,
      autoFixCi,
      autoFixReviews,
      reviewBotUsers: reviewBots,
      githubToken: config.githubToken,
      onPrMerged: (prUrl, taskId) => {
        console.log(chalk.green('✓ PR Merged:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
      },
      onPrClosed: (prUrl, taskId) => {
        console.log(chalk.yellow('✗ PR Closed:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
      },
      onPrComment: (prUrl, taskId, comment, author) => {
        console.log(chalk.blue('💬 PR Comment:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId} | Author: ${author}`));
        console.log(chalk.dim(`  "${comment.slice(0, 100)}${comment.length > 100 ? '...' : ''}"`));
      },
      onBotReview: async (prUrl, taskId, reviewer, body, comments) => {
        console.log(chalk.magenta('🤖 Bot Review:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId} | Reviewer: ${reviewer}`));
        if (body) {
          console.log(chalk.dim(`  Summary: "${body.slice(0, 150)}${body.length > 150 ? '...' : ''}"`));
        }
        if (comments.length > 0) {
          console.log(chalk.dim(`  Inline comments: ${comments.length}`));
        }
        
        // Auto-create follow-up to address review comments
        if (autoFixReviews && config.githubToken) {
          const parentTask = getTask(taskId);
          if (!parentTask) return;
          
          // Don't create duplicate fix tasks (allow one per review cycle)
          // We could track multiple, but for now just check if one exists recently
          if (parentTask.reviewFixTaskId) {
            const existingFix = getTask(parentTask.reviewFixTaskId);
            if (existingFix && (existingFix.status === 'running' || existingFix.status === 'pending')) {
              console.log(chalk.dim(`  Review fix task already in progress: ${parentTask.reviewFixTaskId}`));
              return;
            }
          }
          
          // Build the fix prompt from review feedback
          let fixPrompt = `Code review feedback from ${reviewer} needs to be addressed.\n\n`;
          
          if (body) {
            fixPrompt += `## Review Summary\n${body}\n\n`;
          }
          
          if (comments.length > 0) {
            fixPrompt += `## Inline Comments\n`;
            for (const c of comments) {
              fixPrompt += `### ${c.path}${c.line ? `:${c.line}` : ''}\n${c.body}\n\n`;
            }
          }
          
          fixPrompt += `Please address all the review comments and commit the fixes.`;
          
          const fixTask = createTask({
            repo: parentTask.repo,
            prompt: fixPrompt,
            branch: parentTask.branch,  // Same branch
            baseBranch: parentTask.baseBranch,
          });
          
          // Link tasks
          updateTask(fixTask.id, { parentTaskId: taskId });
          updateTask(taskId, { 
            reviewFixTaskId: fixTask.id,
            reviewFixedAt: new Date().toISOString(),
          } as any);
          
          console.log(chalk.blue('▶ Created review fix task:'), fixTask.id);
          
          // Start the fix task
          try {
            await startTaskContainer({
              task: fixTask,
              githubToken: config.githubToken,
              model: config.model,
              verbose: false,
            });
            console.log(chalk.green('✓ Review fix task started'));
          } catch (error) {
            console.error(chalk.red('Failed to start review fix task:'), error);
          }
        }
      },
      onCiFailed: async (prUrl, taskId, checkName, logs) => {
        console.log(chalk.red('✗ CI Failed:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
        console.log(chalk.dim(`  Check: ${checkName}`));
        
        // Auto-create follow-up to fix CI
        if (autoFixCi && config.githubToken) {
          const parentTask = getTask(taskId);
          if (!parentTask) return;
          
          // Don't create duplicate fix tasks
          if (parentTask.ciFixTaskId) {
            console.log(chalk.dim(`  Fix task already exists: ${parentTask.ciFixTaskId}`));
            return;
          }
          
          // Create follow-up task to fix CI
          const fixPrompt = `The CI check "${checkName}" failed on this PR. Please fix the issue.

CI Error Details:
${logs.slice(0, 2000)}

Fix the failing tests or build issues and commit the changes.`;
          
          const fixTask = createTask({
            repo: parentTask.repo,
            prompt: fixPrompt,
            branch: parentTask.branch,  // Same branch
            baseBranch: parentTask.baseBranch,
          });
          
          // Link tasks
          updateTask(fixTask.id, { parentTaskId: taskId });
          updateTask(taskId, { ciFixTaskId: fixTask.id } as any);
          
          console.log(chalk.blue('▶ Created fix task:'), fixTask.id);
          
          // Start the fix task
          try {
            await startTaskContainer({
              task: fixTask,
              githubToken: config.githubToken,
              model: config.model,
              verbose: false,
            });
            console.log(chalk.green('✓ Fix task started'));
          } catch (error) {
            console.error(chalk.red('Failed to start fix task:'), error);
          }
        }
      },
    });
    
    console.log(chalk.dim(`\nWebhook URL: http://your-host:${port}/webhook`));
    console.log(chalk.dim('Configure this URL in your GitHub repo settings → Webhooks'));
    console.log(chalk.dim('\nEvents to enable:'));
    console.log(chalk.dim('  - Pull requests'));
    console.log(chalk.dim('  - Issue comments'));
    console.log(chalk.dim('  - Check runs (for CI status)'));
    console.log(chalk.dim('  - Pull request reviews (for Greptile/bot reviews)'));
    console.log(chalk.dim('  - Pull request review comments (for inline comments)'));
    console.log(chalk.dim('\nPress Ctrl+C to stop'));
  });
