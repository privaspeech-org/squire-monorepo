import { Command } from 'commander';
import chalk from 'chalk';
import {
  getTask,
} from '@squire/core';

export const statusCommand = new Command('status')
  .description('Get status of a task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    const task = getTask(id);

    if (!task) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }

    // Display status
    console.log(chalk.bold(`Task: ${chalk.cyan(task.id)}\n`));

    const statusColors: Record<string, (s: string) => string> = {
      pending: chalk.yellow,
      running: chalk.blue,
      completed: chalk.green,
      failed: chalk.red,
    };

    const statusColor = statusColors[task.status] || chalk.white;
    console.log(`${chalk.dim('Status:')}    ${statusColor(task.status.toUpperCase())}`);
    console.log(`${chalk.dim('Repo:')}      ${task.repo}`);
    console.log(`${chalk.dim('Branch:')}    ${task.branch}`);
    console.log(`${chalk.dim('Base:')}      ${task.baseBranch}`);
    console.log(`${chalk.dim('Prompt:')}    ${task.prompt}`);
    console.log();
    console.log(`${chalk.dim('Created:')}   ${task.createdAt}`);

    if (task.startedAt) {
      console.log(`${chalk.dim('Started:')}   ${task.startedAt}`);
    }
    if (task.completedAt) {
      console.log(`${chalk.dim('Completed:')} ${task.completedAt}`);
    }

    if (task.containerId) {
      console.log(`${chalk.dim('Container:')} ${task.containerId.slice(0, 12)}`);
    }

    if (task.prUrl) {
      console.log();
      console.log(`${chalk.green('PR:')} ${chalk.underline(task.prUrl)}`);
    }

    if (task.error) {
      console.log();
      console.log(`${chalk.red('Error:')} ${task.error}`);
    }
  });
