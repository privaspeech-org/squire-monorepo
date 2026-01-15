import { Command } from 'commander';
import chalk from 'chalk';
import { getTask, createTask, updateTask } from '../task/store.js';
import { startTaskContainer } from '../worker/container.js';
import { getConfig } from '../config.js';
import { debug, info, createLogger } from '../utils/logger.js';

const logger = createLogger('cli');

export const followupCommand = new Command('followup')
  .alias('fu')
  .description('Send follow-up instructions to a task')
  .argument('<id>', 'Task ID to follow up on')
  .argument('<prompt>', 'Additional instructions')
  .option('-m, --model <model>', 'Model to use')
  .option('--no-start', 'Create follow-up task but don\'t start it')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (id: string, prompt: string, options) => {
    const config = getConfig();
    
    if (!config.githubToken) {
      console.error(chalk.red('Error: GITHUB_TOKEN not set'));
      process.exit(1);
    }
    
    const parentTask = getTask(id);
    
    if (!parentTask) {
      console.error(chalk.red(`Task ${id} not found`));
      process.exit(1);
    }
    
    debug('cli', 'Creating follow-up task', {
      parentTaskId: id,
      promptLength: prompt.length,
    });
    
    // Create follow-up task on the same branch
    const followupTask = createTask({
      repo: parentTask.repo,
      prompt: prompt,
      branch: parentTask.branch,
      baseBranch: parentTask.baseBranch,
    });
    
    // Link to parent
    updateTask(followupTask.id, {
      parentTaskId: parentTask.id,
    });
    
    console.log(chalk.green('✓') + ` Created follow-up task ${chalk.cyan(followupTask.id)}`);
    console.log(`  ${chalk.dim('Parent:')} ${parentTask.id}`);
    console.log(`  ${chalk.dim('Branch:')} ${followupTask.branch} (continuing)`);
    console.log(`  ${chalk.dim('Prompt:')} ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`);
    
    if (options.start === false) {
      console.log(chalk.yellow('\nTask created but not started. Run:'));
      console.log(`  squire start ${followupTask.id}`);
      return;
    }
    
    console.log(chalk.dim('\nStarting worker container...'));
    
    try {
      const containerId = await startTaskContainer({
        task: followupTask,
        githubToken: config.githubToken,
        model: options.model || config.model,
        verbose: options.verbose,
      });
      
      info('cli', 'Follow-up task started', {
        parentTaskId: id,
        followupTaskId: followupTask.id,
        containerId: containerId.slice(0, 12),
      });
      
      console.log(chalk.green('✓') + ` Follow-up running in container ${chalk.dim(containerId.slice(0, 12))}`);
      console.log(chalk.dim('\nCheck status with:'));
      console.log(`  squire status ${followupTask.id}`);
    } catch (error) {
      console.error(chalk.red('\nFailed to start container:'));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
