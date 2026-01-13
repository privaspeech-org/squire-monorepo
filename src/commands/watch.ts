import { Command } from 'commander';
import chalk from 'chalk';
import { listTasks, getTask, updateTask } from '../task/store.js';
import { isContainerRunning, getContainerExitCode, getContainerLogs } from '../worker/container.js';
import { startTaskContainer } from '../worker/container.js';
import { getConfig } from '../config.js';
import { canStartNewTask } from '../task/limits.js';

export const watchCommand = new Command('watch')
  .description('Watch tasks and auto-start queued ones')
  .option('-i, --interval <seconds>', 'Poll interval in seconds', '10')
  .option('--no-auto-start', 'Don\'t auto-start pending tasks')
  .option('--once', 'Check once and exit')
  .action(async (options) => {
    const config = getConfig();
    const interval = parseInt(options.interval, 10) * 1000;
    
    const check = async () => {
      // Update status of running tasks
      const runningTasks = listTasks('running');
      for (const task of runningTasks) {
        if (!task.containerId) continue;
        
        const running = await isContainerRunning(task.containerId);
        if (!running) {
          const exitCode = await getContainerExitCode(task.containerId);
          const newStatus = exitCode === 0 ? 'completed' : 'failed';
          updateTask(task.id, {
            status: newStatus,
            error: exitCode !== 0 ? `Container exited with code ${exitCode}` : undefined,
            completedAt: new Date().toISOString(),
          });
          
          // Get PR URL from task if completed
          const updated = getTask(task.id);
          if (newStatus === 'completed' && updated?.prUrl) {
            console.log(chalk.green('✓') + ` ${task.id} completed → ${updated.prUrl}`);
          } else if (newStatus === 'failed') {
            console.log(chalk.red('✗') + ` ${task.id} failed`);
          }
        }
      }
      
      // Auto-start pending tasks if enabled
      if (options.autoStart && config.githubToken) {
        const pendingTasks = listTasks('pending');
        
        for (const task of pendingTasks) {
          const { allowed, running, max } = await canStartNewTask();
          if (!allowed) break;
          
          console.log(chalk.blue('▶') + ` Starting ${task.id} (${running + 1}/${max})...`);
          
          try {
            await startTaskContainer({
              task,
              githubToken: config.githubToken,
              model: config.model,
              verbose: false,
            });
          } catch (error) {
            console.error(chalk.red(`Failed to start ${task.id}:`), error);
          }
        }
      }
      
      // Show current status
      const tasks = listTasks();
      const counts = {
        running: tasks.filter(t => t.status === 'running').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
      };
      
      if (!options.once) {
        process.stdout.write(`\r${chalk.dim('Status:')} ${chalk.blue(counts.running)} running, ${chalk.yellow(counts.pending)} pending, ${chalk.green(counts.completed)} done, ${chalk.red(counts.failed)} failed`);
      }
    };
    
    if (options.once) {
      await check();
      return;
    }
    
    console.log(chalk.dim(`Watching tasks (poll every ${options.interval}s, Ctrl+C to stop)...\n`));
    
    // Initial check
    await check();
    
    // Poll loop
    const timer = setInterval(check, interval);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log(chalk.dim('\n\nStopped watching.'));
      process.exit(0);
    });
  });
