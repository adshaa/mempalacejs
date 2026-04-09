import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranscriptSplitter } from '../src/core/transcript_splitter';
import * as fs from 'fs';
import * as path from 'path';

describe('TranscriptSplitter', () => {
  const testDir = path.join(__dirname, 'test_splitter_data');
  const inputFilePath = path.join(testDir, 'mega_transcript.txt');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    const content = `
Claude Code v0.1.0
⏺ 10:00 AM Monday, January 01, 2025
Alice joined.
Some more lines to exceed the 10 line minimum requirement.
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
> Hello Alice, how is the project?
It is going well.

Claude Code v0.1.0
⏺ 2:30 PM Tuesday, January 02, 2025
Ben joined.
Padding lines here too.
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
> Ben, can you check the database?
Sure, I will do that now.
`.trim();
    fs.writeFileSync(inputFilePath, content);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should split a multi-session file into separate files', () => {
    const splitter = new TranscriptSplitter(['Alice', 'Ben']);
    const resultFiles = splitter.splitFile(inputFilePath, testDir);
    
    expect(resultFiles).toHaveLength(2);
    expect(fs.existsSync(resultFiles[0])).toBe(true);
    expect(fs.existsSync(resultFiles[1])).toBe(true);
    
    const content1 = fs.readFileSync(resultFiles[0], 'utf-8');
    expect(content1).toContain('Alice joined');
    expect(content1).not.toContain('Ben joined');

    const content2 = fs.readFileSync(resultFiles[1], 'utf-8');
    expect(content2).toContain('Ben joined');
    expect(content2).not.toContain('Alice joined');
  });

  it('should extract correct metadata for filenames', () => {
    const splitter = new TranscriptSplitter(['Alice', 'Ben']);
    const resultFiles = splitter.splitFile(inputFilePath, testDir);
    
    // Check filename format: mega_transcript__2025-01-01_1000AM_Alice_Hello-Alice-how-is-the-project.txt
    const file1 = path.basename(resultFiles[0]);
    expect(file1).toContain('2025-01-01');
    expect(file1).toContain('Alice');
    expect(file1).toContain('Hello-Alice');

    const file2 = path.basename(resultFiles[1]);
    expect(file2).toContain('2025-01-02');
    expect(file2).toContain('Ben');
  });

  it('should return empty array if no boundaries are found', () => {
    const noBoundaryFile = path.join(testDir, 'no_boundary.txt');
    fs.writeFileSync(noBoundaryFile, 'Just some text without session markers.');
    const splitter = new TranscriptSplitter();
    const results = splitter.splitFile(noBoundaryFile, testDir);
    expect(results).toHaveLength(0);
  });
});
