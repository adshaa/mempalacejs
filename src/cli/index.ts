#!/usr/bin/env node

import { Command } from 'commander';
import { MempalaceConfig } from '../core/config';
import { VectorStorage } from '../storage/vector';
import * as path from 'path';
import { runOnboarding } from './onboarding';
import { runMcpServer } from '../mcp/server';

const program = new Command();

program
  .name('mempalace')
  .description('Give your AI a memory — mine projects and conversations into a searchable palace.')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new palace')
  .argument('[dir]', 'Directory to initialize (optional)')
  .action(async (dir) => {
    if (dir) {
      const config = new MempalaceConfig();
      config.init();
      console.log(`Initialized palace in ${dir}`);
    } else {
      await runOnboarding();
    }
  });

program
  .command('search')
  .description('Search the palace')
  .argument('<query>', 'The text to search for')
  .action(async (query: string) => {
    try {
      const config = new MempalaceConfig();
      const dbPath = path.join(config.palacePath, 'lancedb');
      const storage = new VectorStorage(dbPath, config.collectionName);
      
      console.log(`Searching for: "${query}"...`);
      await storage.init();
      
      const results = await storage.search(query);
      if (results.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log('\nResults:');
      results.forEach((r, i) => {
        console.log(`[${i + 1}] ${r.wing} / ${r.room} (Match: ${r.similarity})`);
        console.log(`    ${r.content}`);
        console.log('─'.repeat(40));
      });
      
    } catch (e) {
      console.error('Error during search:', e);
    }
  });

program
  .command('mine')
  .description('Mine data from a directory')
  .argument('<dir>', 'Directory to mine')
  .option('--wing <name>', 'Wing name')
  .action((dir, options) => {
    console.log(`Mining ${dir} for wing: ${options.wing || 'default'}`);
  });

program
  .command('mcp')
  .description('Run the MemPalace MCP server via stdio')
  .action(async () => {
    await runMcpServer();
  });

program.parse(process.argv);
