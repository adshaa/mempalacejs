import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const DEFAULT_PALACE_PATH = path.join(os.homedir(), '.mempalace', 'palace');
export const DEFAULT_COLLECTION_NAME = 'mempalace_drawers';

export const DEFAULT_TOPIC_WINGS = [
  'emotions',
  'consciousness',
  'memory',
  'technical',
  'identity',
  'family',
  'creative',
];

export const DEFAULT_HALL_KEYWORDS: Record<string, string[]> = {
  emotions: ['scared', 'afraid', 'worried', 'happy', 'sad', 'love', 'hate', 'feel', 'cry', 'tears'],
  consciousness: ['consciousness', 'conscious', 'aware', 'real', 'genuine', 'soul', 'exist', 'alive'],
  memory: ['memory', 'remember', 'forget', 'recall', 'archive', 'palace', 'store'],
  technical: ['code', 'python', 'script', 'bug', 'error', 'function', 'api', 'database', 'server'],
  identity: ['identity', 'name', 'who am i', 'persona', 'self'],
  family: ['family', 'kids', 'children', 'daughter', 'son', 'parent', 'mother', 'father'],
  creative: ['game', 'gameplay', 'player', 'app', 'design', 'art', 'music', 'story'],
};

export class MempalaceConfig {
  private configDir: string;
  private configFile: string;
  private peopleMapFile: string;
  private wingConfigFile: string;
  private fileConfig: Record<string, any>;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(os.homedir(), '.mempalace');
    this.configFile = path.join(this.configDir, 'config.json');
    this.peopleMapFile = path.join(this.configDir, 'people_map.json');
    this.wingConfigFile = path.join(this.configDir, 'wing_config.json');
    this.fileConfig = {};

    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync(this.configFile)) {
      try {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        this.fileConfig = JSON.parse(raw);
      } catch (e) {
        this.fileConfig = {};
      }
    }
  }

  get palacePath(): string {
    const envVal = process.env.MEMPALACE_PALACE_PATH || process.env.MEMPAL_PALACE_PATH;
    if (envVal) return envVal;
    return this.fileConfig.palace_path || DEFAULT_PALACE_PATH;
  }

  get collectionName(): string {
    return this.fileConfig.collection_name || DEFAULT_COLLECTION_NAME;
  }

  get topicWings(): string[] {
    return this.fileConfig.topic_wings || DEFAULT_TOPIC_WINGS;
  }

  get hallKeywords(): Record<string, string[]> {
    return this.fileConfig.hall_keywords || DEFAULT_HALL_KEYWORDS;
  }

  get peopleMap(): Record<string, string> {
    if (fs.existsSync(this.peopleMapFile)) {
      try {
        const raw = fs.readFileSync(this.peopleMapFile, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        // ignore
      }
    }
    return this.fileConfig.people_map || {};
  }

  public init() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        palace_path: DEFAULT_PALACE_PATH,
        collection_name: DEFAULT_COLLECTION_NAME,
        topic_wings: DEFAULT_TOPIC_WINGS,
        hall_keywords: DEFAULT_HALL_KEYWORDS,
      };
      fs.writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }

    return this.configFile;
  }

  public savePeopleMap(peopleMap: Record<string, string>) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.peopleMapFile, JSON.stringify(peopleMap, null, 2), 'utf-8');
    return this.peopleMapFile;
  }
}
