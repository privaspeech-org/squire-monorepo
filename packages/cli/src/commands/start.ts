import { Command } from 'commander';
import chalk from 'chalk';
import {
  getTask,
  startTaskContainer,
  debug,
  info,
  createLogger,
} from '@squire/core';
import { getConfig } from '../config.js';

const logger = createLogger('cli');

export const startCommand = new Command('start')
  .description('Start a pending task')
  .argument('<id>', 'Task ID')
  .option('-m, --model <model>', 'Model to use')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (id: string, options) => {
    const config = getConfig();

    if (!config.githubToken) {
      console.error(chalk.red('Error: GITHUB_TOKEN not set'));
      console.error('Set it via environment variable or in ~/.squire/config.json');
      process.exit(1);
    }

    const task = getTask(id);

    if (!task) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }

    if (task.status !== 'pending') {
      console.error(chalk.yellow(`Task ${id} is ${task.status}, not pending`));
      if (task.status === 'running') {
        console.error('Use `squire logs` to view progress');
      }
      process.exit(1);
    }

    debug('cli', 'Starting task', { taskId: id });
    console.log(chalk.dim('Starting worker container...'));

    try {
      const containerId = await startTaskContainer({
        task,
        githubToken: config.githubToken,
        model: options.model || config.model,
        verbose: options.verbose,
        workerImage: config.workerImage,
      });

      info('cli', 'Task started', { taskId: task.id, containerId: containerId.slice(0, 12) });

      console.log(chalk.green('✓') + ` Task running in container ${chalk.dim(containerId.slice(0, 12))}`);
      console.log(chalk.dim('\nCheck status with:'));
      console.log(`  squire status ${task.id}`);
      console.log(chalk.dim('View logs with:'));
      console.log(`  squire logs ${task.id}`);
    } catch (error) {
      console.error(chalk.red('\nFailed to start container:'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
