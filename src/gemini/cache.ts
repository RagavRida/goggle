/**
 * Response Cache
 * 
 * Semantic caching for Gemini API responses.
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { GeminiRequest, GeminiResponse, Result, ok, err } from '../types/index.js';

export interface CacheConfig {
    db: Database.Database;
    defaultTtlMs?: number;
    maxEntries?: number;
}

interface CacheEntry {
    key: string;
    response: GeminiResponse;
    createdAt: number;
    expiresAt: number;
    hitCount: number;
}

export class ResponseCache {
    private db: Database.Database;
    private defaultTtl: number;
    private maxEntries: number;
    private memoryCache: Map<string, CacheEntry> = new Map();

    private stmtInsert: Database.Statement;
    private stmtGet: Database.Statement;
    private stmtIncrementHits: Database.Statement;
    private stmtDelete: Database.Statement;
    private stmtPurgeExpired: Database.Statement;
    private stmtCount: Database.Statement;

    constructor(config: CacheConfig) {
        this.db = config.db;
        this.defaultTtl = config.defaultTtlMs ?? 3600000; // 1 hour
        this.maxEntries = config.maxEntries ?? 10000;

        this.stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO response_cache (key, value, created_at, expires_at, hit_count)
      VALUES (@key, @value, @createdAt, @expiresAt, 0)
    `);

        this.stmtGet = this.db.prepare('SELECT * FROM response_cache WHERE key = ?');

        this.stmtIncrementHits = this.db.prepare(`
      UPDATE response_cache SET hit_count = hit_count + 1 WHERE key = ?
    `);

        this.stmtDelete = this.db.prepare('DELETE FROM response_cache WHERE key = ?');

        this.stmtPurgeExpired = this.db.prepare(`
      DELETE FROM response_cache WHERE expires_at < ?
    `);

        this.stmtCount = this.db.prepare('SELECT COUNT(*) as count FROM response_cache');
    }

    /**
     * Generate cache key from request
     */
    private generateKey(request: GeminiRequest): string {
        // Normalize the request for consistent hashing
        const normalized = {
            prompt: request.prompt.trim(),
            systemInstruction: request.systemInstruction?.trim(),
            context: request.context?.map(c => c.trim()).sort(),
            model: request.config?.model ?? 'gemini-2.0-flash',
            temperature: request.config?.temperature ?? 0.7,
        };

        const hash = createHash('sha256');
        hash.update(JSON.stringify(normalized));
        return hash.digest('hex');
    }

    /**
     * Get cached response
     */
    get(request: GeminiRequest): Result<GeminiResponse | null> {
        try {
            const key = this.generateKey(request);

            // Check memory cache first
            const memCached = this.memoryCache.get(key);
            if (memCached && memCached.expiresAt > Date.now()) {
                memCached.hitCount++;
                return ok({ ...memCached.response, cached: true });
            }

            // Check database
            const row = this.stmtGet.get(key) as Record<string, unknown> | undefined;
            if (!row) return ok(null);

            const expiresAt = row['expires_at'] as number;
            if (expiresAt <= Date.now()) {
                this.stmtDelete.run(key);
                return ok(null);
            }

            this.stmtIncrementHits.run(key);

            const response = JSON.parse(row['value'] as string) as GeminiResponse;
            response.cached = true;

            // Update memory cache
            this.memoryCache.set(key, {
                key,
                response,
                createdAt: row['created_at'] as number,
                expiresAt,
                hitCount: (row['hit_count'] as number) + 1,
            });

            return ok(response);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Store response in cache
     */
    set(request: GeminiRequest, response: GeminiResponse, ttlMs?: number): Result<void> {
        try {
            const key = this.generateKey(request);
            const now = Date.now();
            const expiresAt = now + (ttlMs ?? this.defaultTtl);

            // Check if we need to evict
            this.evictIfNeeded();

            this.stmtInsert.run({
                key,
                value: JSON.stringify(response),
                createdAt: now,
                expiresAt,
            });

            this.memoryCache.set(key, {
                key,
                response,
                createdAt: now,
                expiresAt,
                hitCount: 0,
            });

            return ok(undefined);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Invalidate cache entry
     */
    invalidate(request: GeminiRequest): Result<boolean> {
        try {
            const key = this.generateKey(request);
            const result = this.stmtDelete.run(key);
            this.memoryCache.delete(key);
            return ok(result.changes > 0);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): Result<number> {
        try {
            const count = (this.stmtCount.get() as { count: number }).count;
            this.db.exec('DELETE FROM response_cache');
            this.memoryCache.clear();
            return ok(count);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Purge expired entries
     */
    purgeExpired(): Result<number> {
        try {
            const now = Date.now();
            const result = this.stmtPurgeExpired.run(now);

            // Clean memory cache
            for (const [key, entry] of this.memoryCache.entries()) {
                if (entry.expiresAt <= now) {
                    this.memoryCache.delete(key);
                }
            }

            return ok(result.changes);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get cache statistics
     */
    stats(): Result<{
        entries: number;
        memoryEntries: number;
        totalHits: number;
    }> {
        try {
            const count = (this.stmtCount.get() as { count: number }).count;
            const hits = this.db.prepare('SELECT SUM(hit_count) as total FROM response_cache').get() as { total: number | null };

            return ok({
                entries: count,
                memoryEntries: this.memoryCache.size,
                totalHits: hits.total ?? 0,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    // Private methods

    private evictIfNeeded(): void {
        const count = (this.stmtCount.get() as { count: number }).count;

        if (count >= this.maxEntries) {
            // Delete oldest 10% of entries
            const toDelete = Math.ceil(this.maxEntries * 0.1);
            this.db.prepare(`
        DELETE FROM response_cache 
        WHERE key IN (
          SELECT key FROM response_cache 
          ORDER BY created_at ASC 
          LIMIT ?
        )
      `).run(toDelete);
        }

        // Also limit memory cache
        if (this.memoryCache.size >= 1000) {
            const entries = Array.from(this.memoryCache.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt);

            const toRemove = entries.slice(0, 100);
            for (const [key] of toRemove) {
                this.memoryCache.delete(key);
            }
        }
    }
}
