/**
 * Memory Store
 * 
 * Persistent storage for memory entries with in-memory LRU cache.
 * Supports CRUD operations, bulk operations, and query filtering.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { MemoryEntry, MemoryQuery, MemoryType, Result, ok, err } from '../types/index.js';
import { initializeDatabase, serializeMemoryEntry, deserializeMemoryEntry } from './schema.js';

export interface MemoryStoreConfig {
    dbPath: string;
    cacheSize?: number; // Max entries in LRU cache
    defaultTtl?: number; // Default TTL in milliseconds
}

interface CacheEntry {
    entry: MemoryEntry;
    accessTime: number;
}

export class MemoryStore {
    private db: Database.Database;
    private cache: Map<string, CacheEntry>;
    private cacheSize: number;
    private defaultTtl?: number;

    // Prepared statements for performance
    private stmtInsert: Database.Statement;
    private stmtUpdate: Database.Statement;
    private stmtDelete: Database.Statement;
    private stmtGetById: Database.Statement;
    private stmtGetAll: Database.Statement;

    constructor(config: MemoryStoreConfig) {
        this.db = new Database(config.dbPath);
        this.cacheSize = config.cacheSize ?? 1000;
        this.defaultTtl = config.defaultTtl;
        this.cache = new Map();

        // Initialize schema
        initializeDatabase(this.db);

        // Prepare statements
        this.stmtInsert = this.db.prepare(`
      INSERT INTO memories (id, type, content, embedding, agent_id, task_id, timestamp, ttl, tags, priority, version)
      VALUES (@id, @type, @content, @embedding, @agent_id, @task_id, @timestamp, @ttl, @tags, @priority, @version)
    `);

        this.stmtUpdate = this.db.prepare(`
      UPDATE memories 
      SET type = @type, content = @content, embedding = @embedding, 
          ttl = @ttl, tags = @tags, priority = @priority, version = version + 1,
          updated_at = strftime('%s', 'now') * 1000
      WHERE id = @id
    `);

        this.stmtDelete = this.db.prepare('DELETE FROM memories WHERE id = ?');

        this.stmtGetById = this.db.prepare('SELECT * FROM memories WHERE id = ?');

        this.stmtGetAll = this.db.prepare('SELECT * FROM memories ORDER BY timestamp DESC');
    }

    /**
     * Create a new memory entry
     */
    create(
        type: MemoryType,
        content: Record<string, unknown>,
        agentId: string,
        taskId: string,
        options?: {
            tags?: string[];
            priority?: number;
            ttl?: number;
            embedding?: number[];
        }
    ): Result<MemoryEntry> {
        try {
            const entry: MemoryEntry = {
                id: uuidv4(),
                type,
                content,
                embedding: options?.embedding,
                metadata: {
                    agentId,
                    taskId,
                    timestamp: Date.now(),
                    ttl: options?.ttl ?? this.defaultTtl,
                    tags: options?.tags ?? [],
                    priority: options?.priority ?? 5,
                    version: 1,
                },
            };

            const serialized = serializeMemoryEntry(entry);
            this.stmtInsert.run(serialized);

            this.addToCache(entry);

            return ok(entry);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get a memory entry by ID
     */
    get(id: string): Result<MemoryEntry | null> {
        try {
            // Check cache first
            const cached = this.cache.get(id);
            if (cached) {
                cached.accessTime = Date.now();
                return ok(cached.entry);
            }

            const row = this.stmtGetById.get(id) as Record<string, unknown> | undefined;
            if (!row) {
                return ok(null);
            }

            const entry = deserializeMemoryEntry(row);
            this.addToCache(entry);

            return ok(entry);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Update an existing memory entry
     */
    update(
        id: string,
        updates: Partial<Pick<MemoryEntry, 'type' | 'content' | 'embedding'>> & {
            tags?: string[];
            priority?: number;
            ttl?: number;
        }
    ): Result<MemoryEntry | null> {
        try {
            const existing = this.get(id);
            if (!existing.ok) return existing;
            if (!existing.value) return ok(null);

            const entry = existing.value;
            const updated: MemoryEntry = {
                ...entry,
                type: updates.type ?? entry.type,
                content: updates.content ?? entry.content,
                embedding: updates.embedding ?? entry.embedding,
                metadata: {
                    ...entry.metadata,
                    tags: updates.tags ?? entry.metadata.tags,
                    priority: updates.priority ?? entry.metadata.priority,
                    ttl: updates.ttl ?? entry.metadata.ttl,
                    version: entry.metadata.version + 1,
                },
            };

            const serialized = serializeMemoryEntry(updated);
            this.stmtUpdate.run(serialized);

            this.addToCache(updated);

            return ok(updated);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Delete a memory entry
     */
    delete(id: string): Result<boolean> {
        try {
            const result = this.stmtDelete.run(id);
            this.cache.delete(id);
            return ok(result.changes > 0);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Query memory entries with filters
     */
    query(query: MemoryQuery): Result<MemoryEntry[]> {
        try {
            const conditions: string[] = ['1=1'];
            const params: Record<string, unknown> = {};

            if (query.types && query.types.length > 0) {
                conditions.push(`type IN (${query.types.map((_, i) => `@type${i}`).join(', ')})`);
                query.types.forEach((t, i) => { params[`type${i}`] = t; });
            }

            if (query.agentId) {
                conditions.push('agent_id = @agentId');
                params['agentId'] = query.agentId;
            }

            if (query.taskId) {
                conditions.push('task_id = @taskId');
                params['taskId'] = query.taskId;
            }

            if (query.tags && query.tags.length > 0) {
                // Check if any of the query tags exist in the stored tags JSON array
                const tagConditions = query.tags.map((_, i) => `tags LIKE @tag${i}`);
                conditions.push(`(${tagConditions.join(' OR ')})`);
                query.tags.forEach((t, i) => { params[`tag${i}`] = `%"${t}"%`; });
            }

            if (query.since !== undefined) {
                conditions.push('timestamp >= @since');
                params['since'] = query.since;
            }

            if (query.until !== undefined) {
                conditions.push('timestamp <= @until');
                params['until'] = query.until;
            }

            let sql = `SELECT * FROM memories WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;

            if (query.limit !== undefined) {
                sql += ` LIMIT @limit`;
                params['limit'] = query.limit;
            }

            if (query.offset !== undefined) {
                sql += ` OFFSET @offset`;
                params['offset'] = query.offset;
            }

            const stmt = this.db.prepare(sql);
            const rows = stmt.all(params) as Record<string, unknown>[];

            return ok(rows.map(deserializeMemoryEntry));
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get all memory entries (with optional limit)
     */
    getAll(limit?: number): Result<MemoryEntry[]> {
        return this.query({ limit });
    }

    /**
     * Bulk insert memory entries
     */
    bulkCreate(entries: Array<{
        type: MemoryType;
        content: Record<string, unknown>;
        agentId: string;
        taskId: string;
        options?: {
            tags?: string[];
            priority?: number;
            ttl?: number;
            embedding?: number[];
        };
    }>): Result<MemoryEntry[]> {
        const results: MemoryEntry[] = [];

        const transaction = this.db.transaction(() => {
            for (const entry of entries) {
                const memoryEntry: MemoryEntry = {
                    id: uuidv4(),
                    type: entry.type,
                    content: entry.content,
                    embedding: entry.options?.embedding,
                    metadata: {
                        agentId: entry.agentId,
                        taskId: entry.taskId,
                        timestamp: Date.now(),
                        ttl: entry.options?.ttl ?? this.defaultTtl,
                        tags: entry.options?.tags ?? [],
                        priority: entry.options?.priority ?? 5,
                        version: 1,
                    },
                };

                const serialized = serializeMemoryEntry(memoryEntry);
                this.stmtInsert.run(serialized);
                results.push(memoryEntry);
            }
        });

        try {
            transaction();
            results.forEach(entry => this.addToCache(entry));
            return ok(results);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Delete expired entries based on TTL
     */
    purgeExpired(): Result<number> {
        try {
            const now = Date.now();
            const stmt = this.db.prepare(`
        DELETE FROM memories 
        WHERE ttl IS NOT NULL AND (timestamp + ttl) < ?
      `);
            const result = stmt.run(now);

            // Clear expired entries from cache
            for (const [id, cached] of this.cache.entries()) {
                const { entry } = cached;
                if (entry.metadata.ttl && (entry.metadata.timestamp + entry.metadata.ttl) < now) {
                    this.cache.delete(id);
                }
            }

            return ok(result.changes);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get memory statistics
     */
    stats(): Result<{
        totalEntries: number;
        byType: Record<string, number>;
        cacheSize: number;
        cacheHitRate: number;
    }> {
        try {
            const total = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
            const byType = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type').all() as { type: string; count: number }[];

            return ok({
                totalEntries: total.count,
                byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
                cacheSize: this.cache.size,
                cacheHitRate: 0, // TODO: Track cache hits/misses
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Close the database connection
     */
    close(): void {
        this.db.close();
        this.cache.clear();
    }

    // Private methods

    private addToCache(entry: MemoryEntry): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.cacheSize) {
            let oldestKey: string | undefined;
            let oldestTime = Infinity;

            for (const [key, cached] of this.cache.entries()) {
                if (cached.accessTime < oldestTime) {
                    oldestTime = cached.accessTime;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(entry.id, {
            entry,
            accessTime: Date.now(),
        });
    }
}
