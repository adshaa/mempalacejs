#!/usr/bin/env node

import { Command } from 'commander';
import { MempalaceConfig } from '../core/config';
import { VectorStorage } from '../storage/vector';
import * as path from 'path';
import { runOnboarding } from './onboarding';
import { runMcpServer } from '../mcp/server';
import { mineDirectory } from '../core/miner';
import { mineConversations } from '../core/convo_miner';
import { spellcheckUserText } from '../core/spellcheck';
import { TranscriptSplitter } from '../core/transcript_splitter';
import { MemoryStack } from '../core/layers';
import * as fs from 'fs';
import * as os from 'os';
import yaml from 'js-yaml';

const program = new Command();

program
  .name('mempalace')
  .description('Give your AI a memory — mine projects and conversations into a searchable palace.')
  .version('0.0.2-dev');

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
      
      const cleanQuery = spellcheckUserText(query);
      console.log(`Searching for: "${cleanQuery}"...`);
      await storage.init();
      
      const results = await storage.search(cleanQuery);
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
      
      await storage.close();
    } catch (e) {
      console.error('Error during search:', e);
    }
  });

program
  .command('mine')
  .description('Mine data from a directory')
  .argument('<dir>', 'Directory to mine')
  .option('--wing <name>', 'Wing name override')
  .option('--type <type>', 'Type of data: "code" or "convo"', 'code')
  .action(async (dir, options) => {
    const config = new MempalaceConfig();
    const dbPath = path.join(config.palacePath, 'lancedb');
    const storage = new VectorStorage(dbPath, config.collectionName);
    await storage.init();

    const targetDir = path.resolve(dir);
    let wing = options.wing || path.basename(targetDir);
    let rooms = [{ name: 'general', keywords: [] }];

    if (options.type === 'code') {
      const yamlPath = path.join(targetDir, 'mempalace.yaml');
      if (fs.existsSync(yamlPath)) {
        try {
          const fileContent = fs.readFileSync(yamlPath, 'utf8');
          const projectConfig = yaml.load(fileContent) as any;
          if (projectConfig.wing && !options.wing) wing = projectConfig.wing;
          if (projectConfig.rooms) rooms = projectConfig.rooms;
        } catch (e: any) {
          console.warn(`Could not read mempalace.yaml: ${e.message}. Using defaults.`);
        }
      }
      await mineDirectory(targetDir, storage, { wing, rooms });
    } else if (options.type === 'convo') {
      await mineConversations(targetDir, storage, wing);
    } else {
      console.error(`Invalid type: ${options.type}. Use "code" or "convo".`);
    }

    await storage.close();
  });

program
  .command('status')
  .description('Show palace status and taxonomy')
  .action(async () => {
    const config = new MempalaceConfig();
    const dbPath = path.join(config.palacePath, 'lancedb');
    const storage = new VectorStorage(dbPath, config.collectionName);
    await storage.init();

    const taxonomy = await storage.getTaxonomy();
    console.log(`\nMemPalace Status — ${taxonomy.total} drawers`);
    console.log(`Palace Path: ${config.palacePath}\n`);

    for (const [wing, count] of Object.entries(taxonomy.wings)) {
      console.log(`WING: ${wing} (${count} drawers)`);
    }

    await storage.close();
  });

program
  .command('wake-up')
  .description('Generate wake-up text for AI (L0 + L1)')
  .option('--wing <name>', 'Wing to focus on')
  .action(async (options) => {
    const config = new MempalaceConfig();
    const dbPath = path.join(config.palacePath, 'lancedb');
    const storage = new VectorStorage(dbPath, config.collectionName);
    await storage.init();

    const stack = new MemoryStack(config, storage);
    const text = await stack.wakeUp(options.wing);
    console.log(text);
    await storage.close();
  });

program
  .command('recall')
  .description('On-demand L2 retrieval')
  .option('--wing <name>', 'Wing filter')
  .option('--room <name>', 'Room filter')
  .option('--limit <number>', 'Number of results', '10')
  .action(async (options) => {
    const config = new MempalaceConfig();
    const dbPath = path.join(config.palacePath, 'lancedb');
    const storage = new VectorStorage(dbPath, config.collectionName);
    await storage.init();

    const stack = new MemoryStack(config, storage);
    const text = await stack.recall(options.wing, options.room, parseInt(options.limit));
    console.log(text);
    await storage.close();
  });

program
  .command('split')
  .description('Split large multi-session transcript files')
  .argument('<file>', 'File to split')
  .option('--output <dir>', 'Output directory')
  .action(async (file, options) => {
    const splitter = new TranscriptSplitter();
    const results = splitter.splitFile(file, options.output);
    if (results.length > 0) {
      console.log(`Successfully split into ${results.length} files:`);
      results.forEach(f => console.log(`  ✓ ${path.basename(f)}`));
    } else {
      console.log('No sessions found to split.');
    }
  });

program
  .command('install-hooks')
  .description('Install Claude Code auto-save hooks to ~/.mempalace/hooks')
  .action(async () => {
    const homeHooks = path.join(os.homedir(), '.mempalace', 'hooks');
    if (!fs.existsSync(homeHooks)) {
      fs.mkdirSync(homeHooks, { recursive: true });
    }

    // Try to find hooks in the package
    const packageHooks = path.join(__dirname, '..', '..', 'hooks');
    const files = ['mempal_save_hook.sh', 'mempal_precompact_hook.sh'];

    let installed = 0;
    for (const file of files) {
      const src = path.join(packageHooks, file);
      if (fs.existsSync(src)) {
        const dest = path.join(homeHooks, file);
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o755);
        console.log(`✓ Installed ${file} to ${dest}`);
        installed++;
      }
    }

    if (installed > 0) {
      console.log('\nHooks installed! To use them with Claude Code, add them to your config:');
      console.log(`claude config set postExchangeHook "${path.join(homeHooks, 'mempal_save_hook.sh')}"`);
    } else {
      console.error('Could not find hook source files in the package.');
    }
  });

program
  .command('mcp')
  .description('Run the MemPalace MCP server via stdio')
  .action(async () => {
    await runMcpServer();
  });

program.parse(process.argv);
