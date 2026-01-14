import { Command } from 'commander';
import chalk from 'chalk';
import { getTask, createTask } from '../task/store.js';
import { startTaskContainer } from '../worker/container.js';
import { getConfig } from '../config.js';
import { debug, info, createLogger } from '../utils/logger.js';

const logger = createLogger('cli');

export const retryCommand = new Command('retry')
  .description('Retry a failed task')
  .argument('<id>', 'Task ID to retry')
  .option('-m, --model <model>', 'Use a different model')
  .option('--new-branch', 'Create a new branch instead of reusing')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (id: string, options) => {
    const config = getConfig();
    
    if (!config.githubToken) {
      console.error(chalk.red('Error: GITHUB_TOKEN not set'));
      process.exit(1);
    }
    
    const failedTask = getTask(id);
    
    if (!failedTask) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }
    
    if (failedTask.status !== 'failed') {
      console.error(chalk.yellow(`Task ${id} is ${failedTask.status}, not failed`));
      console.error('Use `squire followup` for completed tasks');
      process.exit(1);
    }
    
    debug('cli', 'Retrying failed task', { originalTaskId: id, newBranch: options.newBranch });
    
    // Create retry task
    const retryTask = createTask({
      repo: failedTask.repo,
      prompt: failedTask.prompt,
      branch: options.newBranch ? undefined : failedTask.branch,
      baseBranch: failedTask.baseBranch,
    });
    
    console.log(chalk.green('✓') + ` Created retry task ${chalk.cyan(retryTask.id)}`);
    console.log(`  ${chalk.dim('Original:')} ${failedTask.id}`);
    console.log(`  ${chalk.dim('Branch:')} ${retryTask.branch}`);
    console.log(`  ${chalk.dim('Prompt:')} ${retryTask.prompt.slice(0, 60)}...`);
    
    console.log(chalk.dim('\nStarting worker container...'));
    
    try {
      const containerId = await startTaskContainer({
        task: retryTask,
        githubToken: config.githubToken,
        model: options.model || config.model,
        verbose: options.verbose,
      });
      
      info('cli', 'Retry task started', {
        originalTaskId: id,
        retryTaskId: retryTask.id,
        containerId: containerId.slice(0, 12),
      });
      
      console.log(chalk.green('✓') + ` Retry running in container ${chalk.dim(containerId.slice(0, 12))}`);
      console.log(chalk.dim('\nCheck status with:'));
      console.log(`  squire status ${retryTask.id}`);
    } catch (error) {
      console.error(chalk.red('\nFailed to start container:'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
