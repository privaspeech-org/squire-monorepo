import { Command } from 'commander';
import chalk from 'chalk';
import { getTask, getContainerLogs } from '@squire/core';

export const logsCommand = new Command('logs')
  .description('View logs from a task\'s container')
  .argument('<id>', 'Task ID')
  .option('-n, --tail <lines>', 'Number of lines to show', '100')
  .option('-f, --follow', 'Follow log output (not yet implemented)')
  .action(async (id: string, options) => {
    const task = getTask(id);

    if (!task) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }

    if (!task.containerId) {
      console.error(chalk.yellow('Task has no container (may not have started yet)'));
      process.exit(1);
    }

    if (options.follow) {
      console.error(chalk.yellow('--follow not yet implemented'));
    }

    try {
      const tail = parseInt(options.tail, 10);
      const logs = await getContainerLogs(task.containerId, tail);

      if (!logs.trim()) {
        console.log(chalk.dim('No logs yet.'));
        return;
      }

      // Clean up docker log stream formatting (remove header bytes)
      const cleanLogs = logs
        .split('\n')
        .map(line => {
          // Docker multiplexed streams have 8-byte headers
          if (line.length > 8) {
            return line.slice(8);
          }
          return line;
        })
        .join('\n');

      console.log(cleanLogs);
    } catch (error) {
      console.error(chalk.red('Failed to get logs:'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
