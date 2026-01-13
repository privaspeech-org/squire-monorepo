import { Command } from 'commander';
import chalk from 'chalk';
import { getTask, updateTask } from '../task/store.js';
import { stopContainer, isContainerRunning } from '../worker/container.js';

export const stopCommand = new Command('stop')
  .description('Stop a running task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    const task = getTask(id);
    
    if (!task) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }
    
    if (task.status !== 'running') {
      console.error(chalk.yellow(`Task ${id} is ${task.status}, not running`));
      process.exit(1);
    }
    
    if (!task.containerId) {
      console.error(chalk.yellow('Task has no container ID'));
      process.exit(1);
    }
    
    const running = await isContainerRunning(task.containerId);
    
    if (!running) {
      console.log(chalk.yellow('Container already stopped'));
      updateTask(id, { status: 'failed', error: 'Stopped by user' });
      return;
    }
    
    console.log(chalk.dim('Stopping container...'));
    
    try {
      await stopContainer(task.containerId);
      updateTask(id, { 
        status: 'failed', 
        error: 'Stopped by user',
        completedAt: new Date().toISOString(),
      });
      console.log(chalk.green('✓') + ' Task stopped');
    } catch (error) {
      console.error(chalk.red('Failed to stop container:'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
