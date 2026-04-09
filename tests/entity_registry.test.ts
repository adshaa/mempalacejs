import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EntityRegistry, RegistryEntity } from '../src/core/entity_registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('EntityRegistry', () => {
  const testDir = path.join(__dirname, 'test_registry_data');
  const filePath = path.join(testDir, 'registry.json');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize with default data when file does not exist', () => {
    const registry = new EntityRegistry(filePath);
    expect(registry.getSummary()).toContain('People: 0');
    expect(registry.getProjects()).toHaveLength(0);
  });

  it('should seed and save data', () => {
    const registry = new EntityRegistry(filePath);
    const people: RegistryEntity[] = [
      { name: 'Alice', type: 'person', confidence: 1.0, source: 'onboarding' }
    ];
    const projects = ['MemPalace'];
    
    registry.seed('work', people, projects);
    expect(registry.getSummary()).toContain('People: 1');
    expect(registry.getProjects()).toContain('MemPalace');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should lookup registered people', () => {
    const registry = new EntityRegistry(filePath);
    const people: RegistryEntity[] = [
      { name: 'Alice', type: 'person', confidence: 1.0, source: 'onboarding', aliases: ['Ali'] }
    ];
    registry.seed('work', people, []);

    const result1 = registry.lookup('Alice');
    expect(result1.type).toBe('person');
    expect(result1.name).toBe('Alice');

    const result2 = registry.lookup('Ali');
    expect(result2.type).toBe('person');
    expect(result2.name).toBe('Alice');
  });

  it('should lookup registered projects', () => {
    const registry = new EntityRegistry(filePath);
    registry.seed('work', [], ['MemPalace']);

    const result = registry.lookup('MemPalace');
    expect(result.type).toBe('project');
    expect(result.source).toBe('onboarding');
  });

  it('should return unknown for non-registered words', () => {
    const registry = new EntityRegistry(filePath);
    const result = registry.lookup('RandomWord');
    expect(result.type).toBe('unknown');
  });

  it('should handle ambiguous flags for common English words', () => {
    const registry = new EntityRegistry(filePath);
    // 'Will' is a common word and a name
    const people: RegistryEntity[] = [
      { name: 'Will', type: 'person', confidence: 1.0, source: 'onboarding' }
    ];
    registry.seed('combo', people, []);
    
    const result = registry.lookup('Will');
    expect(result.name).toBe('Will');
    // The registry doesn't currently do much with the flag in lookup return, 
    // but we check if it was seeded correctly.
  });
});
