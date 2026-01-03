/**
 * Embeddings Service
 * 
 * Batch embedding generation with caching.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { EmbeddingRequest, EmbeddingResponse, Result, ok, err } from '../types/index.js';

export interface EmbeddingsConfig {
    apiKey: string;
    db: Database.Database;
    model?: string;
    batchSize?: number;
    cacheTtlMs?: number;
}

const EMBEDDINGS_CACHE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS embeddings_cache (
    key TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_embeddings_expires ON embeddings_cache(expires_at);
`;

export class EmbeddingsService {
    private genAI: GoogleGenerativeAI;
    private db: Database.Database;
    private model: string;
    private batchSize: number;
    private cacheTtl: number;

    private stmtInsert: Database.Statement;
    private stmtGet: Database.Statement;
    private stmtPurge: Database.Statement;

    constructor(config: EmbeddingsConfig) {
        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.db = config.db;
        this.model = config.model ?? 'text-embedding-004';
        this.batchSize = config.batchSize ?? 100;
        this.cacheTtl = config.cacheTtlMs ?? 86400000; // 24 hours

        // Ensure cache table exists
        this.db.exec(EMBEDDINGS_CACHE_SCHEMA);

        this.stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings_cache (key, embedding, created_at, expires_at)
      VALUES (@key, @embedding, @createdAt, @expiresAt)
    `);

        this.stmtGet = this.db.prepare('SELECT * FROM embeddings_cache WHERE key = ? AND expires_at > ?');

        this.stmtPurge = this.db.prepare('DELETE FROM embeddings_cache WHERE expires_at < ?');
    }

    /**
     * Generate embeddings for texts
     */
    async embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse>> {
        const startTime = Date.now();
        const { texts } = request;

        try {
            const embeddings: number[][] = new Array(texts.length);
            const toGenerate: { index: number; text: string }[] = [];
            let cacheHits = 0;

            // Check cache for each text
            const now = Date.now();
            for (let i = 0; i < texts.length; i++) {
                const text = texts[i]!;
                const key = this.generateKey(text);
                const cached = this.stmtGet.get(key, now) as Record<string, unknown> | undefined;

                if (cached) {
                    const buffer = cached['embedding'] as Buffer;
                    const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
                    embeddings[i] = Array.from(float32);
                    cacheHits++;
                } else {
                    toGenerate.push({ index: i, text });
                }
            }

            // Generate missing embeddings in batches
            if (toGenerate.length > 0) {
                const model = this.genAI.getGenerativeModel({ model: this.model });

                for (let i = 0; i < toGenerate.length; i += this.batchSize) {
                    const batch = toGenerate.slice(i, i + this.batchSize);
                    const batchTexts = batch.map(b => b.text);

                    const result = await model.embedContent({
                        content: { parts: batchTexts.map(text => ({ text })), role: 'user' },
                    });

                    // Handle the embedding response
                    const embedding = result.embedding.values;

                    // For single text, the API returns one embedding
                    // For multiple texts, we need to handle differently
                    if (batch.length === 1) {
                        const item = batch[0]!;
                        embeddings[item.index] = embedding;
                        this.cacheEmbedding(item.text, embedding);
                    } else {
                        // For batch, each text gets the same dimension embedding
                        // We need to call embed individually for accurate results
                        for (const item of batch) {
                            const singleResult = await model.embedContent({
                                content: { parts: [{ text: item.text }], role: 'user' },
                            });
                            embeddings[item.index] = singleResult.embedding.values;
                            this.cacheEmbedding(item.text, singleResult.embedding.values);
                        }
                    }
                }
            }

            const latencyMs = Date.now() - startTime;

            return ok({
                embeddings,
                cached: cacheHits === texts.length,
                latencyMs,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Generate embedding for a single text
     */
    async embedOne(text: string): Promise<Result<number[]>> {
        const result = await this.embed({ texts: [text] });
        if (!result.ok) return result;

        const embedding = result.value.embeddings[0];
        if (!embedding) {
            return err(new Error('No embedding generated'));
        }

        return ok(embedding);
    }

    /**
     * Purge expired cache entries
     */
    purgeExpired(): Result<number> {
        try {
            const result = this.stmtPurge.run(Date.now());
            return ok(result.changes);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get cache statistics
     */
    stats(): Result<{ entries: number; sizeBytes: number }> {
        try {
            const count = this.db.prepare('SELECT COUNT(*) as count FROM embeddings_cache').get() as { count: number };
            const size = this.db.prepare('SELECT SUM(LENGTH(embedding)) as size FROM embeddings_cache').get() as { size: number | null };

            return ok({
                entries: count.count,
                sizeBytes: size.size ?? 0,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    // Private methods

    private generateKey(text: string): string {
        const hash = createHash('sha256');
        hash.update(text.trim());
        hash.update(this.model);
        return hash.digest('hex');
    }

    private cacheEmbedding(text: string, embedding: number[]): void {
        const key = this.generateKey(text);
        const now = Date.now();
        const buffer = Buffer.from(new Float32Array(embedding).buffer);

        this.stmtInsert.run({
            key,
            embedding: buffer,
            createdAt: now,
            expiresAt: now + this.cacheTtl,
        });
    }
}

export { GeminiClient } from './client.js';
export type { ClientConfig } from './client.js';
export { ResponseCache } from './cache.js';
export type { CacheConfig } from './cache.js';
