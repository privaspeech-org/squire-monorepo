import { Command } from 'commander';
import chalk from 'chalk';
import {
  getTask,
  updateTask,
  isContainerRunning,
  getContainerExitCode,
  removeContainer,
} from '@squire/core';
import { getConfig } from '../config.js';

export const statusCommand = new Command('status')
  .description('Get status of a task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    const task = getTask(id);

    if (!task) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }

    // If task is marked as running, check if container is still alive
    if (task.status === 'running' && task.containerId) {
      const running = await isContainerRunning(task.containerId);

      if (!running) {
        // Container finished - re-read task file as container may have updated it
        const updatedTask = getTask(id);
        if (updatedTask) {
          Object.assign(task, updatedTask);
        }

        // If container updated the status, use that. Otherwise check exit code.
        if (task.status === 'running') {
          const exitCode = await getContainerExitCode(task.containerId);

          if (exitCode === 0) {
            updateTask(id, {
              status: 'completed',
              completedAt: new Date().toISOString(),
            });
            task.status = 'completed';
          } else {
            updateTask(id, {
              status: 'failed',
              error: `Container exited with code ${exitCode}`,
              completedAt: new Date().toISOString(),
            });
            task.status = 'failed';
            task.error = `Container exited with code ${exitCode}`;
          }

          // Auto-cleanup container if enabled and task is done
          const config = getConfig();
          if (config.autoCleanup && (task.status === 'completed' || task.status === 'failed')) {
            try {
              await removeContainer(task.containerId);
              console.log(chalk.dim(`Container ${task.containerId.slice(0, 12)} removed (auto-cleanup)`));
            } catch {
              // Ignore cleanup errors - container might already be removed
            }
          }
        }
      }
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
