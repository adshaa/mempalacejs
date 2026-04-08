import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VectorStorage } from '../storage/vector';
import { MempalaceConfig } from './config';

/**
 * layers.ts — 4-Layer Memory Stack for MemPalace JS
 * 
 * Layer 0: Identity       (~100 tokens)   — Always loaded. "Who am I?"
 * Layer 1: Essential Story (~500-800)      — Always loaded. Top moments from the palace.
 * Layer 2: On-Demand      (~200-500 each)  — Loaded when a topic/wing comes up.
 * Layer 3: Deep Search    (unlimited)      — Full LanceDB semantic search.
 */

export class Layer0 {
    private path: string;
    private text: string | null = null;

    constructor(identityPath?: string) {
        this.path = identityPath || path.join(os.homedir(), '.mempalace', 'identity.txt');
    }

    public render(): string {
        if (this.text !== null) return this.text;

        if (fs.existsSync(this.path)) {
            this.text = fs.readFileSync(this.path, 'utf-8').trim();
        } else {
            this.text = "## L0 — IDENTITY\nNo identity configured. Create ~/.mempalace/identity.txt";
        }
        return this.text!;
    }

    public tokenEstimate(): number {
        return Math.floor(this.render().length / 4);
    }
}

export class Layer1 {
    private storage: VectorStorage;
    private wing?: string;
    private MAX_DRAWERS = 15;
    private MAX_CHARS = 3200;

    constructor(storage: VectorStorage, wing?: string) {
        this.storage = storage;
        this.wing = wing;
    }

    public async generate(): Promise<string> {
        if (!(await this.storage.hasTable())) {
            return "## L1 — No palace found. Run: mempalace mine <dir>";
        }

        // Fetch drawers (limited to 100 for L1 generation)
        const drawers = await this.storage.listDrawers(100, this.wing ? { wing: this.wing } : undefined);
        
        if (drawers.length === 0) {
            return "## L1 — No memories yet.";
        }

        // Score drawers (importance weighting)
        // In this port, we use 'importance' metadata if it exists, otherwise default to 3
        const scored = drawers.map(d => ({
            importance: Number((d as any).importance || 3),
            room: d.room || 'general',
            content: d.content,
            sourceFile: path.basename(d.sourceFile)
        }));

        scored.sort((a, b) => b.importance - a.importance);
        const top = scored.slice(0, this.MAX_DRAWERS);

        const byRoom: Record<string, typeof top> = {};
        for (const item of top) {
            if (!byRoom[item.room]) byRoom[item.room] = [];
            byRoom[item.room].push(item);
        }

        let output = "## L1 — ESSENTIAL STORY";
        let totalLen = output.length;

        for (const [room, items] of Object.entries(byRoom)) {
            const roomHeader = `\n[${room}]`;
            if (totalLen + roomHeader.length > this.MAX_CHARS) break;
            output += roomHeader;
            totalLen += roomHeader.length;

            for (const item of items) {
                let snippet = item.content.trim().replace(/\n/g, ' ');
                if (snippet.length > 200) snippet = snippet.substring(0, 197) + '...';
                
                const line = `  - ${snippet} (${item.sourceFile})`;
                if (totalLen + line.length > this.MAX_CHARS) {
                    output += "\n  ... (more in L3 search)";
                    return output;
                }
                output += `\n${line}`;
                totalLen += line.length + 1;
            }
        }

        return output;
    }
}

export class MemoryStack {
    private config: MempalaceConfig;
    private storage: VectorStorage;
    public l0: Layer0;
    
    constructor(config: MempalaceConfig, storage: VectorStorage) {
        this.config = config;
        this.storage = storage;
        this.l0 = new Layer0(path.join(path.dirname(config.palacePath), 'identity.txt'));
    }

    public async wakeUp(wing?: string): Promise<string> {
        const parts: string[] = [];
        parts.push(this.l0.render());
        parts.push("");

        const l1 = new Layer1(this.storage, wing);
        parts.push(await l1.generate());

        return parts.join('\n');
    }

    public async recall(wing?: string, room?: string, nResults: number = 10): Promise<string> {
        if (!(await this.storage.hasTable())) return "No palace found.";

        const drawers = await this.storage.listDrawers(nResults, { wing, room });
        if (drawers.length === 0) return "No drawers found for filters.";

        let output = `## L2 — ON-DEMAND (${drawers.length} drawers)`;
        for (const d of drawers) {
            let snippet = d.content.trim().replace(/\n/g, ' ');
            if (snippet.length > 300) snippet = snippet.substring(0, 297) + '...';
            output += `\n  [${d.room}] ${snippet} (${path.basename(d.sourceFile)})`;
        }
        return output;
    }

    public async search(query: string, wing?: string, room?: string, nResults: number = 5): Promise<string> {
        const results = await this.storage.search(query, nResults, { wing, room });
        if (results.length === 0) return "No results found.";

        let output = `## L3 — SEARCH RESULTS for "${query}"`;
        results.forEach((r, i) => {
            let snippet = r.content.trim().replace(/\n/g, ' ');
            if (snippet.length > 300) snippet = snippet.substring(0, 297) + '...';
            output += `\n  [${i + 1}] ${r.wing}/${r.room} (sim=${r.similarity})`;
            output += `\n      ${snippet}`;
            output += `\n      src: ${path.basename(r.sourceFile)}`;
        });
        return output;
    }
}
