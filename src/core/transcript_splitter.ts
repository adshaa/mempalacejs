import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * transcript_splitter.ts — Split concatenated transcript files into per-session files.
 * Ported from split_mega_files.py
 */

interface SessionMeta {
    timestampHuman: string | null;
    timestampIso: string | null;
    people: string[];
    subject: string;
}

const MONTHS: Record<string, string> = {
    "January": "01", "February": "02", "March": "03", "April": "04",
    "May": "05", "June": "06", "July": "07", "August": "08",
    "September": "09", "October": "10", "November": "11", "December": "12"
};

const FALLBACK_PEOPLE = ["Alice", "Ben", "Riley", "Max", "Sam", "Devon", "Jordan"];

export class TranscriptSplitter {
    private knownPeople: string[];

    constructor(knownPeople: string[] = FALLBACK_PEOPLE) {
        this.knownPeople = knownPeople;
    }

    public splitFile(filePath: string, outputDir?: string, dryRun: boolean = false): string[] {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        const boundaries = this.findSessionBoundaries(lines);
        if (boundaries.length < 2) return [];

        const outDir = outputDir || path.dirname(filePath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const writtenFiles: string[] = [];
        const baseName = path.parse(filePath).name;

        for (let i = 0; i < boundaries.length; i++) {
            const start = boundaries[i];
            const end = boundaries[i + 1] || lines.length;
            const chunk = lines.slice(start, end);
            
            if (chunk.length < 10) continue;

            const meta = this.extractMeta(chunk);
            const tsPart = meta.timestampHuman || `part${(i + 1).toString().padStart(2, '0')}`;
            const peoplePart = meta.people.length > 0 ? meta.people.slice(0, 3).join('-') : 'unknown';
            
            let fileName = `${baseName}__${tsPart}_${peoplePart}_${meta.subject}.txt`;
            fileName = fileName.replace(/[^\w.-]/g, '_').replace(/_+/g, '_');
            
            const outPath = path.join(outDir, fileName);
            if (!dryRun) {
                fs.writeFileSync(outPath, chunk.join('\n'));
            }
            writtenFiles.push(outPath);
        }

        return writtenFiles;
    }

    private findSessionBoundaries(lines: string[]): number[] {
        const boundaries: number[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("Claude Code v")) {
                // True session start check
                const nearby = lines.slice(i, i + 6).join('');
                if (!nearby.includes("Ctrl+E") && !nearby.includes("previous messages")) {
                    boundaries.push(i);
                }
            }
        }
        return boundaries;
    }

    private extractMeta(lines: string[]): SessionMeta {
        let timestampHuman: string | null = null;
        let timestampIso: string | null = null;

        // TS Regex: ⏺ H:MM AM/PM Weekday, Month DD, YYYY
        const tsRegex = /⏺\s+(\d{1,2}:\d{2}\s+[AP]M)\s+\w+,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/;
        
        for (const line of lines.slice(0, 50)) {
            const match = line.match(tsRegex);
            if (match) {
                const [_, timeStr, month, day, year] = match;
                const mon = MONTHS[month] || "00";
                const dayZ = day.padStart(2, '0');
                const timeSafe = timeStr.replace(/[: ]/g, '');
                timestampIso = `${year}-${mon}-${dayZ}`;
                timestampHuman = `${year}-${mon}-${dayZ}_${timeSafe}`;
                break;
            }
        }

        const text = lines.slice(0, 100).join(' ');
        const people = this.knownPeople.filter(p => 
            new RegExp(`\\b${p}\\b`, 'i').test(text)
        );

        let subject = 'session';
        const skipPatterns = /^(\.\/|cd |ls |python|bash|git |cat |source |export |claude|.\/activate)/;
        for (const line of lines) {
            if (line.startsWith("> ")) {
                const prompt = line.substring(2).trim();
                if (prompt && !skipPatterns.test(prompt) && prompt.length > 5) {
                    subject = prompt.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 60);
                    break;
                }
            }
        }

        return { timestampHuman, timestampIso, people, subject };
    }
}
