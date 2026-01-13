import { Command } from 'commander';
import chalk from 'chalk';
import { startWebhookServer } from '../webhook/server.js';

export const webhookCommand = new Command('webhook')
  .description('Start webhook server to receive GitHub events')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-s, --secret <secret>', 'Webhook secret (or JULES_WEBHOOK_SECRET env)')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const secret = options.secret || process.env.JULES_WEBHOOK_SECRET;
    
    console.log(chalk.bold('Starting webhook server...\n'));
    
    if (!secret) {
      console.log(chalk.yellow('⚠ No webhook secret configured'));
      console.log(chalk.dim('  Set via --secret or JULES_WEBHOOK_SECRET'));
      console.log(chalk.dim('  Without a secret, signatures won\'t be verified\n'));
    }
    
    startWebhookServer({
      port,
      secret,
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
    });
    
    console.log(chalk.dim(`\nWebhook URL: http://your-host:${port}/webhook`));
    console.log(chalk.dim('Configure this URL in your GitHub repo settings → Webhooks'));
    console.log(chalk.dim('\nEvents to enable:'));
    console.log(chalk.dim('  - Pull requests'));
    console.log(chalk.dim('  - Issue comments'));
    console.log(chalk.dim('\nPress Ctrl+C to stop'));
  });
