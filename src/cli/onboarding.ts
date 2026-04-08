import { intro, outro, text, select, confirm, spinner, isCancel, cancel } from '@clack/prompts';
import { MempalaceConfig } from '../core/config';
import * as path from 'path';

export async function runOnboarding() {
  intro('Welcome to MemPalace JS Setup');

  const config = new MempalaceConfig();
  
  const palaceDir = await text({
    message: 'Where should your memory palace live?',
    initialValue: config.palacePath,
  });

  if (isCancel(palaceDir)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const shouldMine = await confirm({
    message: 'Would you like to mine a project folder now?',
  });

  if (isCancel(shouldMine)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  if (shouldMine) {
    const projectDir = await text({
      message: 'Enter the project path to mine:',
    });
    if (isCancel(projectDir)) {
      cancel('Setup cancelled.');
      process.exit(0);
    }
    console.log(`Mining project at ${projectDir}...`);
  }

  config.init();
  outro('MemPalace initialized successfully!');
}
