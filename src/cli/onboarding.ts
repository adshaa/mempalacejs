import { intro, outro, text, select, confirm, spinner } from '@clack/prompts';
import { MempalaceConfig } from '../core/config';
import * as path from 'path';

export async function runOnboarding() {
  intro('Welcome to MemPalace JS Setup');

  const config = new MempalaceConfig();
  
  const palaceDir = await text({
    message: 'Where should your memory palace live?',
    initialValue: config.palacePath,
  });

  const shouldMine = await confirm({
    message: 'Would you like to mine a project folder now?',
  });

  if (shouldMine) {
    const projectDir = await text({
      message: 'Enter the project path to mine:',
    });
    console.log(`Mining project at ${projectDir}...`);
  }

  config.init();
  outro('MemPalace initialized successfully!');
}
