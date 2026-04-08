/**
 * MemPalace Core Interfaces
 */

export type EntityType = 'person' | 'project' | 'place' | 'concept' | 'unknown';

/**
 * Represents a Drawer in the Palace (a raw chunk of text).
 * Stored in the Vector Database (LanceDB).
 */
export interface Drawer {
  /** Deterministic hash ID based on wing, room, and content */
  id: string;
  /** The vector embedding of the content */
  vector?: number[];
  /** The verbatim text content */
  content: string;
  
  // Metadata fields
  wing: string;
  room: string;
  sourceFile: string;
  chunkIndex: number;
  addedBy: string;
  filedAt: string;
  hall?: string;
  topic?: string;
  type?: string;
  agent?: string;
  date?: string;
}

/**
 * Knowledge Graph Entity
 */
export interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  createdAt?: string;
}

/**
 * Knowledge Graph Relationship Triple
 */
export interface Triple {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom?: string;
  validTo?: string;
  confidence?: number;
  sourceCloset?: string;
  sourceFile?: string;
  
  // Enriched fields when querying
  subName?: string;
  objName?: string;
  current?: boolean;
}

/**
 * Wing Configuration
 * Maps names/keywords to wings.
 */
export interface WingConfig {
  default_wing: string;
  wings: Record<string, {
    type: string;
    keywords: string[];
  }>;
}

/**
 * Global Configuration
 */
export interface GlobalConfig {
  palace_path: string;
  collection_name: string;
  people_map: Record<string, string>;
}
