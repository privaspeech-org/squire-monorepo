import { Command } from 'commander';
import chalk from 'chalk';
import { listTasks, type TaskStatus } from '@squire/core';

const STATUS_COLORS: Record<TaskStatus, (s: string) => string> = {
  pending: chalk.yellow,
  running: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
};

export const listCommand = new Command('list')
  .alias('ls')
  .description('List all tasks')
  .option('-s, --status <status>', 'Filter by status (pending, running, completed, failed)')
  .option('-n, --limit <n>', 'Limit number of results', '10')
  .action(async (options) => {
    const status = options.status as TaskStatus | undefined;
    let tasks = listTasks(status);

    const limit = parseInt(options.limit, 10);
    if (limit > 0) {
      tasks = tasks.slice(0, limit);
    }

    if (tasks.length === 0) {
      console.log(chalk.dim('No tasks found.'));
      return;
    }

    console.log(chalk.bold('Tasks:\n'));

    for (const task of tasks) {
      const statusColor = STATUS_COLORS[task.status];
      const statusBadge = statusColor(`[${task.status.toUpperCase()}]`);

      console.log(`${chalk.cyan(task.id)} ${statusBadge}`);
      console.log(`  ${chalk.dim('Repo:')} ${task.repo}`);
      console.log(`  ${chalk.dim('Prompt:')} ${task.prompt.slice(0, 60)}${task.prompt.length > 60 ? '...' : ''}`);

      if (task.prUrl) {
        console.log(`  ${chalk.dim('PR:')} ${chalk.underline(task.prUrl)}`);
      }
      if (task.error) {
        console.log(`  ${chalk.red('Error:')} ${task.error}`);
      }

      const age = getRelativeTime(new Date(task.createdAt));
      console.log(`  ${chalk.dim('Created:')} ${age}`);
      console.log();
    }
  });

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
