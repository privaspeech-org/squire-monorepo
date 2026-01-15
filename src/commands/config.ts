import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getConfig } from '../config.js';

const CONFIG_PATH = join(homedir(), '.squire', 'config.json');

export const configCommand = new Command('config')
  .description('View or set configuration')
  .argument('[key]', 'Config key to get/set')
  .argument('[value]', 'Value to set')
  .option('--list', 'List all config values')
  .option('--path', 'Show config file path')
  .action(async (key: string | undefined, value: string | undefined, options) => {
    if (options.path) {
      console.log(CONFIG_PATH);
      return;
    }
    
    const config = getConfig();
    
    if (options.list || !key) {
      console.log(chalk.bold('Current configuration:\n'));
      console.log(`  ${chalk.dim('githubToken:')} ${config.githubToken ? chalk.green('set') : chalk.red('not set')}`);
      console.log(`  ${chalk.dim('model:')}       ${config.model || 'opencode/glm-4.7-free'}`);
      console.log(`  ${chalk.dim('tasksDir:')}    ${config.tasksDir || './tasks'}`);
      console.log(`  ${chalk.dim('workerImage:')} ${config.workerImage || 'squire-worker:latest'}`);
      console.log();
      console.log(chalk.dim(`Config file: ${CONFIG_PATH}`));
      return;
    }
    
    if (!value) {
      // Get single value
      const val = (config as Record<string, unknown>)[key];
      if (key === 'githubToken' && val) {
        console.log(chalk.green('set') + chalk.dim(' (hidden)'));
      } else {
        console.log(val ?? chalk.dim('not set'));
      }
      return;
    }
    
    // Set value
    const validKeys = ['githubToken', 'model', 'tasksDir', 'workerImage'];
    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.error(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
      process.exit(1);
    }
    
    // Read existing config or create new
    let fileConfig: Record<string, unknown> = {};
    if (existsSync(CONFIG_PATH)) {
      try {
        fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      } catch {
        // Invalid JSON, start fresh
      }
    }
    
    // Update config
    fileConfig[key] = value;
    
    // Ensure directory exists
    const configDir = join(homedir(), '.squire');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    // Write config
    writeFileSync(CONFIG_PATH, JSON.stringify(fileConfig, null, 2));
    console.log(chalk.green('✓') + ` Set ${key}`);
  });
