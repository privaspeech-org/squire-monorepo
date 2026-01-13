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
  .action(async (options) => {
    const config = getConfig();
    const port = parseInt(options.port, 10);
    const secret = options.secret || process.env.JULES_WEBHOOK_SECRET;
    const autoFixCi = options.autoFixCi;
    
    console.log(chalk.bold('Starting webhook server...\n'));
    
    if (!secret) {
      console.log(chalk.yellow('⚠ No webhook secret configured'));
      console.log(chalk.dim('  Set via --secret or JULES_WEBHOOK_SECRET\n'));
    }
    
    if (autoFixCi && !config.githubToken) {
      console.log(chalk.yellow('⚠ --auto-fix-ci requires GITHUB_TOKEN'));
      console.log(chalk.dim('  Set via environment or jules config\n'));
    }
    
    if (autoFixCi) {
      console.log(chalk.green('✓ Auto-fix CI enabled'));
      console.log(chalk.dim('  Will create follow-up tasks when CI fails\n'));
    }
    
    startWebhookServer({
      port,
      secret,
      autoFixCi,
      githubToken: config.githubToken,
      onPrMerged: (prUrl, taskId) => {
        console.log(chalk.green('✓ PR Merged:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
      },
      onPrClosed: (prUrl, taskId) => {
        console.log(chalk.yellow('✗ PR Closed:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
      },
      onPrComment: (prUrl, taskId, comment) => {
        console.log(chalk.blue('💬 PR Comment:'), prUrl);
        console.log(chalk.dim(`  Task: ${taskId}`));
        console.log(chalk.dim(`  "${comment.slice(0, 100)}${comment.length > 100 ? '...' : ''}"`));
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
    console.log(chalk.dim('\nPress Ctrl+C to stop'));
  });
