/**
 * Memory Schema and Database Initialization
 * 
 * Defines SQLite schema for persistent memory storage.
 * Designed for PostgreSQL compatibility (avoiding SQLite-specific features).
 */

import Database from 'better-sqlite3';
import { MemoryEntry, MemoryMetadata } from '../types/index.js';

export const MEMORY_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('fact', 'decision', 'observation', 'artifact', 'context')),
    content TEXT NOT NULL,
    embedding BLOB,
    agent_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    ttl INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 5,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id);
  CREATE INDEX IF NOT EXISTS idx_memories_task_id ON memories(task_id);
  CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
  CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);
`;

export const CACHE_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS response_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    expires_at INTEGER,
    hit_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expires ON response_cache(expires_at);
`;

export const AGENTS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '[]',
    state TEXT NOT NULL DEFAULT 'offline' CHECK (state IN ('idle', 'busy', 'blocked', 'offline')),
    config TEXT NOT NULL DEFAULT '{}',
    last_seen INTEGER NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_agents_state ON agents(state);
  CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);
`;

export const TASKS_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    agent_id TEXT,
    parent_task_id TEXT REFERENCES tasks(id),
    input TEXT,
    output TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
`;

export const MESSAGES_TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('request', 'response', 'event', 'command', 'query')),
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    reply_to TEXT,
    correlation_id TEXT,
    ttl INTEGER,
    processed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_correlation ON messages(correlation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_processed ON messages(processed);
`;

/**
 * Initialize the database with all required schemas
 */
export function initializeDatabase(db: Database.Database): void {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    db.exec(MEMORY_TABLE_SCHEMA);
    db.exec(CACHE_TABLE_SCHEMA);
    db.exec(AGENTS_TABLE_SCHEMA);
    db.exec(TASKS_TABLE_SCHEMA);
    db.exec(MESSAGES_TABLE_SCHEMA);
}

/**
 * Serialize a MemoryEntry for database storage
 */
export function serializeMemoryEntry(entry: MemoryEntry): Record<string, unknown> {
    return {
        id: entry.id,
        type: entry.type,
        content: JSON.stringify(entry.content),
        embedding: entry.embedding ? Buffer.from(new Float32Array(entry.embedding).buffer) : null,
        agent_id: entry.metadata.agentId,
        task_id: entry.metadata.taskId,
        timestamp: entry.metadata.timestamp,
        ttl: entry.metadata.ttl ?? null,
        tags: JSON.stringify(entry.metadata.tags),
        priority: entry.metadata.priority,
        version: entry.metadata.version,
    };
}

/**
 * Deserialize a database row into a MemoryEntry
 */
export function deserializeMemoryEntry(row: Record<string, unknown>): MemoryEntry {
    const embeddingBuffer = row['embedding'] as Buffer | null;
    let embedding: number[] | undefined;

    if (embeddingBuffer) {
        const float32Array = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4);
        embedding = Array.from(float32Array);
    }

    const metadata: MemoryMetadata = {
        agentId: row['agent_id'] as string,
        taskId: row['task_id'] as string,
        timestamp: row['timestamp'] as number,
        ttl: row['ttl'] as number | undefined,
        tags: JSON.parse(row['tags'] as string) as string[],
        priority: row['priority'] as number,
        version: row['version'] as number,
    };

    return {
        id: row['id'] as string,
        type: row['type'] as MemoryEntry['type'],
        content: JSON.parse(row['content'] as string) as Record<string, unknown>,
        embedding,
        metadata,
    };
}
