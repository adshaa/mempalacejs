import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { normalize } from '../src/core/normalize';

describe('Normalize', () => {
  const tempFiles: string[] = [];

  function createTempFile(content: string, suffix: string): string {
    const filePath = path.join(os.tmpdir(), `test_${Math.random().toString(36).substring(7)}${suffix}`);
    fs.writeFileSync(filePath, content);
    tempFiles.push(filePath);
    return filePath;
  }

  afterEach(() => {
    for (const file of tempFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    tempFiles.length = 0;
  });

  it('should pass through plain text', () => {
    const fp = createTempFile('Hello world\nSecond line\n', '.txt');
    const result = normalize(fp);
    expect(result).toContain('Hello world');
  });

  it('should normalize Claude JSON', () => {
    const data = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }];
    const fp = createTempFile(JSON.stringify(data), '.json');
    const result = normalize(fp);
    expect(result).toContain('> Hi');
    expect(result).toContain('Hello');
  });

  it('should handle empty files', () => {
    const fp = createTempFile('', '.txt');
    const result = normalize(fp);
    expect(result.trim()).toBe('');
  });

  it('should normalize Claude Code JSONL', () => {
    const lines = [
      JSON.stringify({ type: 'human', message: { content: 'Hi' } }),
      JSON.stringify({ type: 'assistant', message: { content: 'Hello' } })
    ];
    const fp = createTempFile(lines.join('\n'), '.jsonl');
    const result = normalize(fp);
    expect(result).toContain('> Hi');
    expect(result).toContain('Hello');
  });

  it('should normalize ChatGPT JSON', () => {
    const data = {
      mapping: {
        'root': { message: null, children: ['msg1'] },
        'msg1': { 
          message: { author: { role: 'user' }, content: { parts: ['Hello'] } },
          children: ['msg2']
        },
        'msg2': {
          message: { author: { role: 'assistant' }, content: { parts: ['Hi there'] } },
          children: []
        }
      }
    };
    const fp = createTempFile(JSON.stringify(data), '.json');
    const result = normalize(fp);
    expect(result).toContain('> Hello');
    expect(result).toContain('Hi there');
  });

  it('should normalize Slack JSON', () => {
    const data = [
      { type: 'message', user: 'U1', text: 'Hello' },
      { type: 'message', user: 'U2', text: 'Hi' }
    ];
    const fp = createTempFile(JSON.stringify(data), '.json');
    const result = normalize(fp);
    expect(result).toContain('> Hello');
    expect(result).toContain('Hi');
  });

  it('should normalize Codex JSONL', () => {
    const lines = [
      JSON.stringify({ type: 'session_meta' }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Hello' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'Hi' } })
    ];
    const fp = createTempFile(lines.join('\n'), '.jsonl');
    const result = normalize(fp);
    expect(result).toContain('> Hello');
    expect(result).toContain('Hi');
  });
});
