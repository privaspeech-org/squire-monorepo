import { Command } from 'commander';
import chalk from 'chalk';
import { listTasks, updateTask } from '../task/store.js';
import { isContainerRunning, getContainerExitCode } from '../worker/container.js';

export const psCommand = new Command('ps')
  .description('Show running tasks (like docker ps)')
  .option('-a, --all', 'Show all tasks, not just running')
  .action(async (options) => {
    let tasks = listTasks();
    
    if (!options.all) {
      tasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
    }
    
    if (tasks.length === 0) {
      console.log(chalk.dim(options.all ? 'No tasks.' : 'No running tasks.'));
      return;
    }
    
    // Check actual container status for running tasks
    for (const task of tasks) {
      if (task.status === 'running' && task.containerId) {
        const running = await isContainerRunning(task.containerId);
        if (!running) {
          const exitCode = await getContainerExitCode(task.containerId);
          const newStatus = exitCode === 0 ? 'completed' : 'failed';
          updateTask(task.id, {
            status: newStatus,
            error: exitCode !== 0 ? `Container exited with code ${exitCode}` : undefined,
            completedAt: new Date().toISOString(),
          });
          task.status = newStatus;
        }
      }
    }
    
    // Re-filter if we only want running
    if (!options.all) {
      tasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
    }
    
    if (tasks.length === 0) {
      console.log(chalk.dim('No running tasks.'));
      return;
    }
    
    // Header
    console.log(
      chalk.dim('ID'.padEnd(12)) +
      chalk.dim('STATUS'.padEnd(12)) +
      chalk.dim('REPO'.padEnd(30)) +
      chalk.dim('PROMPT')
    );
    console.log(chalk.dim('─'.repeat(80)));
    
    // Rows
    for (const task of tasks) {
      const statusColors: Record<string, (s: string) => string> = {
        pending: chalk.yellow,
        running: chalk.blue,
        completed: chalk.green,
        failed: chalk.red,
      };
      const statusColor = statusColors[task.status] || chalk.white;
      
      const id = task.id.slice(0, 10).padEnd(12);
      const status = statusColor(task.status.toUpperCase().padEnd(10));
      const repo = task.repo.slice(0, 28).padEnd(30);
      const prompt = task.prompt.slice(0, 30) + (task.prompt.length > 30 ? '...' : '');
      
      console.log(`${id}${status}${repo}${prompt}`);
    }
  });
