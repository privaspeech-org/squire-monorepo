import { Command } from 'commander';
import chalk from 'chalk';
import { createTask } from '../task/store.js';
import { startTaskContainer } from '../worker/container.js';
import { getConfig } from '../config.js';

export const newCommand = new Command('new')
  .description('Create and start a new coding task')
  .argument('<repo>', 'Repository (owner/repo or full URL)')
  .argument('<prompt>', 'What to do')
  .option('-b, --branch <branch>', 'Branch name (default: jules/<id>)')
  .option('--base <base>', 'Base branch (default: main)')
  .option('-m, --model <model>', 'Model to use (default: opencode/glm-4.7-free)')
  .option('--no-start', 'Create task but don\'t start it')
  .action(async (repo: string, prompt: string, options) => {
    const config = getConfig();
    
    if (!config.githubToken) {
      console.error(chalk.red('Error: GITHUB_TOKEN not set'));
      console.error('Set it via environment variable or in ~/.jules/config.json');
      process.exit(1);
    }
    
    // Create the task
    const task = createTask({
      repo,
      prompt,
      branch: options.branch,
      baseBranch: options.base,
    });
    
    console.log(chalk.green('✓') + ` Created task ${chalk.cyan(task.id)}`);
    console.log(`  Repo: ${chalk.dim(task.repo)}`);
    console.log(`  Branch: ${chalk.dim(task.branch)}`);
    console.log(`  Prompt: ${chalk.dim(task.prompt.slice(0, 60))}${task.prompt.length > 60 ? '...' : ''}`);
    
    if (options.start === false) {
      console.log(chalk.yellow('\nTask created but not started. Run:'));
      console.log(`  jules start ${task.id}`);
      return;
    }
    
    // Start the container
    console.log(chalk.dim('\nStarting worker container...'));
    
    try {
      const containerId = await startTaskContainer({
        task,
        githubToken: config.githubToken,
        model: options.model || config.model,
        verbose: true,
      });
      
      console.log(chalk.green('✓') + ` Task running in container ${chalk.dim(containerId.slice(0, 12))}`);
      console.log(chalk.dim('\nCheck status with:'));
      console.log(`  jules status ${task.id}`);
      console.log(chalk.dim('View logs with:'));
      console.log(`  jules logs ${task.id}`);
    } catch (error) {
      console.error(chalk.red('\nFailed to start container:'));
      console.error(error instanceof Error ? error.message : error);
      console.error(chalk.dim('\nMake sure Docker is running and the jules-worker image is built:'));
      console.error(chalk.dim('  docker build -t jules-worker .'));
      process.exit(1);
    }
  });
