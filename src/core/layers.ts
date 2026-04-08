import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VectorStorage } from '../storage/vector';
import { MempalaceConfig } from './config';
import { Dialect } from './dialect';

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

    public async *generateStream(): AsyncGenerator<string> {
        if (!(await this.storage.hasTable())) {
            yield "## L1 — No palace found. Run: mempalace mine <dir>";
            return;
        }

        const drawers = await this.storage.listDrawers(100, this.wing ? { wing: this.wing } : undefined);
        if (drawers.length === 0) {
            yield "## L1 — No memories yet.";
            return;
        }

        const dialect = new Dialect();

        const scored = drawers.map(d => ({
            importance: Number(d.importance || 3),
            room: d.room || 'general',
            content: d.content,
            sourceFile: d.sourceFile,
            wing: d.wing
        }));

        scored.sort((a, b) => b.importance - a.importance);
        const top = scored.slice(0, this.MAX_DRAWERS);

        const byRoom: Record<string, typeof top> = {};
        for (const item of top) {
            if (!byRoom[item.room]) byRoom[item.room] = [];
            byRoom[item.room].push(item);
        }

        yield "## L1 — ESSENTIAL STORY (AAAK)";
        let totalLen = 30;

        for (const [room, items] of Object.entries(byRoom)) {
            const roomHeader = `\n[${room}]`;
            if (totalLen + roomHeader.length > this.MAX_CHARS) break;
            yield roomHeader;
            totalLen += roomHeader.length;

            for (const item of items) {
                // Use AAAK compression for high-density L1 story
                const compressed = dialect.compress(item.content, {
                    source_file: item.sourceFile,
                    wing: item.wing,
                    room: item.room
                });
                
                const line = `  ${compressed.replace(/\n/g, ' | ')}`;
                if (totalLen + line.length > this.MAX_CHARS) {
                    yield "\n  ... (more in L3 search)";
                    return;
                }
                yield `\n${line}`;
                totalLen += line.length + 1;
            }
        }
    }

    public async generate(): Promise<string> {
        let output = "";
        for await (const chunk of this.generateStream()) {
            output += chunk;
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

    public async *wakeUpStream(wing?: string): AsyncGenerator<string> {
        yield this.l0.render();
        yield "\n\n";

        const l1 = new Layer1(this.storage, wing);
        for await (const chunk of l1.generateStream()) {
            yield chunk;
        }
    }

    public async wakeUp(wing?: string): Promise<string> {
        let output = "";
        for await (const chunk of this.wakeUpStream(wing)) {
            output += chunk;
        }
        return output;
    }

    public async *recallStream(wing?: string, room?: string, nResults: number = 10): AsyncGenerator<string> {
        if (!(await this.storage.hasTable())) {
            yield "No palace found.";
            return;
        }

        const drawers = await this.storage.listDrawers(nResults, { wing, room });
        if (drawers.length === 0) {
            yield "No drawers found for filters.";
            return;
        }

        yield `## L2 — ON-DEMAND (${drawers.length} drawers)`;
        for (const d of drawers) {
            let snippet = d.content.trim().replace(/\n/g, ' ');
            if (snippet.length > 300) snippet = snippet.substring(0, 297) + '...';
            yield `\n  [${d.room}] ${snippet} (${path.basename(d.sourceFile)})`;
        }
    }

    public async recall(wing?: string, room?: string, nResults: number = 10): Promise<string> {
        let output = "";
        for await (const chunk of this.recallStream(wing, room, nResults)) {
            output += chunk;
        }
        return output;
    }

    public async *searchStream(query: string, wing?: string, room?: string, nResults: number = 5): AsyncGenerator<string> {
        const results = await this.storage.search(query, nResults, { wing, room });
        if (results.length === 0) {
            yield "No results found.";
            return;
        }

        yield `## L3 — SEARCH RESULTS for "${query}"`;
        
        let i = 1;
        for (const r of results) {
            let snippet = r.content.trim().replace(/\n/g, ' ');
            if (snippet.length > 300) snippet = snippet.substring(0, 297) + '...';
            yield `\n  [${i}] ${r.wing}/${r.room} (sim=${r.similarity})`;
            yield `\n      ${snippet}`;
            yield `\n      src: ${path.basename(r.sourceFile)}`;
            i++;
        }
    }

    public async search(query: string, wing?: string, room?: string, nResults: number = 5): Promise<string> {
        let output = "";
        for await (const chunk of this.searchStream(query, wing, room, nResults)) {
            output += chunk;
        }
        return output;
    }
}
