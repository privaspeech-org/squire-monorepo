import { Command } from 'commander';
import chalk from 'chalk';
import {
  listTasks,
  deleteTask,
  removeContainer,
  listSquireContainers,
} from '@squire/core';

export const cleanCommand = new Command('clean')
  .description('Clean up completed/failed tasks and containers')
  .option('--all', 'Remove all tasks (including running)')
  .option('--containers', 'Also remove stopped containers')
  .option('--dry-run', 'Show what would be removed without removing')
  .action(async (options) => {
    const tasks = listTasks();
    const toRemove = tasks.filter(t =>
      options.all || t.status === 'completed' || t.status === 'failed'
    );

    if (toRemove.length === 0) {
      console.log(chalk.dim('No tasks to clean.'));
      return;
    }

    console.log(chalk.bold(`Tasks to remove: ${toRemove.length}\n`));

    for (const task of toRemove) {
      const statusColor = task.status === 'completed' ? chalk.green : chalk.red;
      console.log(`  ${chalk.cyan(task.id)} ${statusColor(task.status)} - ${task.prompt.slice(0, 40)}...`);

      if (!options.dryRun) {
        // Remove container if requested
        if (options.containers && task.containerId) {
          try {
            await removeContainer(task.containerId);
            console.log(chalk.dim(`    Removed container ${task.containerId.slice(0, 12)}`));
          } catch {
            // Container might already be gone
          }
        }

        // Remove task file
        await deleteTask(task.id);
      }
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\n--dry-run: No changes made'));
    } else {
      console.log(chalk.green(`\n✓ Removed ${toRemove.length} task(s)`));
    }

    // Show container cleanup option if not already doing it
    if (!options.containers && !options.dryRun) {
      try {
        const containers = await listSquireContainers();
        const stoppedContainers = containers.filter(c => c.State !== 'running');
        if (stoppedContainers.length > 0) {
          console.log(chalk.dim(`\nTip: ${stoppedContainers.length} stopped container(s) remain.`));
          console.log(chalk.dim('Run `squire clean --containers` to remove them.'));
        }
      } catch {
        // Docker might not be available
      }
    }
  });
