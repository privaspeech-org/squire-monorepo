#!/usr/bin/env node

import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';

const program = new Command();

program
  .name('jules')
  .description('Async coding agent - fire and forget, come back to a PR')
  .version('0.1.0');

program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);

program.parse();
