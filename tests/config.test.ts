import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MempalaceConfig, DEFAULT_PALACE_PATH, DEFAULT_COLLECTION_NAME } from '../src/core/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MempalaceConfig', () => {
  const testDir = path.join(os.tmpdir(), `mempalace_config_test_${Math.random().toString(36).substring(7)}`);

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should use default values when no config exists', () => {
    const config = new MempalaceConfig(testDir);
    expect(config.palacePath).toBe(DEFAULT_PALACE_PATH);
    expect(config.collectionName).toBe(DEFAULT_COLLECTION_NAME);
  });

  it('should read values from config.json', () => {
    const customPath = '/tmp/custom_palace';
    const configData = {
      palace_path: customPath,
      collection_name: 'custom_drawers'
    };
    fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify(configData));

    const config = new MempalaceConfig(testDir);
    expect(config.palacePath).toBe(customPath);
    expect(config.collectionName).toBe('custom_drawers');
  });

  it('should initialize config directory and file', () => {
    const config = new MempalaceConfig(testDir);
    config.init();
    expect(fs.existsSync(path.join(testDir, 'config.json'))).toBe(true);
  });

  it('should handle people map', () => {
    const config = new MempalaceConfig(testDir);
    const peopleMap = { 'Alice': 'person_alice' };
    config.savePeopleMap(peopleMap);
    expect(config.peopleMap).toEqual(peopleMap);
    expect(fs.existsSync(path.join(testDir, 'people_map.json'))).toBe(true);
  });

  it('should prioritize environment variables', () => {
    process.env.MEMPALACE_PALACE_PATH = '/tmp/env_palace';
    const config = new MempalaceConfig(testDir);
    expect(config.palacePath).toBe('/tmp/env_palace');
    delete process.env.MEMPALACE_PALACE_PATH;
  });
});
