/**
 * Memory Index
 * 
 * Provides semantic search and vector similarity operations for memory entries.
 */

import { MemoryEntry, SemanticQuery, Result, ok, err } from '../types/index.js';
import { MemoryStore } from './store.js';

export interface MemoryIndexConfig {
    store: MemoryStore;
    embeddingDimension?: number;
}

export interface ScoredEntry {
    entry: MemoryEntry;
    score: number;
}

export class MemoryIndex {
    private store: MemoryStore;
    private embeddingDimension: number;

    constructor(config: MemoryIndexConfig) {
        this.store = config.store;
        this.embeddingDimension = config.embeddingDimension ?? 768; // Gemini embedding dimension
    }

    /**
     * Perform semantic search using cosine similarity
     */
    semanticSearch(query: SemanticQuery): Result<ScoredEntry[]> {
        try {
            // First, get all entries that match the non-semantic filters
            const entriesResult = this.store.query({
                types: query.types,
                agentId: query.agentId,
                taskId: query.taskId,
                tags: query.tags,
                since: query.since,
                until: query.until,
            });

            if (!entriesResult.ok) {
                return entriesResult;
            }

            // Filter to entries with embeddings and compute similarity
            const threshold = query.threshold ?? 0.5;
            const scored: ScoredEntry[] = [];

            for (const entry of entriesResult.value) {
                if (!entry.embedding) continue;

                const similarity = this.cosineSimilarity(query.embedding, entry.embedding);
                if (similarity >= threshold) {
                    scored.push({ entry, score: similarity });
                }
            }

            // Sort by score descending
            scored.sort((a, b) => b.score - a.score);

            // Apply limit
            const limited = query.limit ? scored.slice(0, query.limit) : scored;

            return ok(limited);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Find entries similar to a given entry
     */
    findSimilar(entryId: string, options?: {
        threshold?: number;
        limit?: number;
        excludeSelf?: boolean;
    }): Result<ScoredEntry[]> {
        const entryResult = this.store.get(entryId);
        if (!entryResult.ok) return entryResult as Result<ScoredEntry[]>;
        if (!entryResult.value) return ok([]);

        const entry = entryResult.value;
        if (!entry.embedding) {
            return ok([]);
        }

        const result = this.semanticSearch({
            embedding: entry.embedding,
            threshold: options?.threshold ?? 0.7,
            limit: (options?.limit ?? 10) + 1, // +1 to account for self
        });

        if (!result.ok) return result;

        // Optionally exclude the query entry itself
        if (options?.excludeSelf !== false) {
            return ok(result.value.filter(s => s.entry.id !== entryId).slice(0, options?.limit ?? 10));
        }

        return result;
    }

    /**
     * Cluster entries by similarity
     * Simple greedy clustering - entries are assigned to the first cluster they're similar enough to
     */
    cluster(options?: {
        threshold?: number;
        maxClusters?: number;
    }): Result<ScoredEntry[][]> {
        try {
            const entriesResult = this.store.getAll();
            if (!entriesResult.ok) return entriesResult as Result<ScoredEntry[][]>;

            const entries = entriesResult.value.filter(e => e.embedding);
            const threshold = options?.threshold ?? 0.8;
            const maxClusters = options?.maxClusters ?? 100;

            const clusters: ScoredEntry[][] = [];
            const assigned = new Set<string>();

            for (const entry of entries) {
                if (assigned.has(entry.id)) continue;
                if (clusters.length >= maxClusters) break;

                // Start a new cluster with this entry
                const cluster: ScoredEntry[] = [{ entry, score: 1.0 }];
                assigned.add(entry.id);

                // Find all similar entries
                for (const other of entries) {
                    if (assigned.has(other.id)) continue;
                    if (!entry.embedding || !other.embedding) continue;

                    const similarity = this.cosineSimilarity(entry.embedding, other.embedding);
                    if (similarity >= threshold) {
                        cluster.push({ entry: other, score: similarity });
                        assigned.add(other.id);
                    }
                }

                clusters.push(cluster);
            }

            return ok(clusters);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Compute the average embedding for a set of entries
     */
    computeCentroid(entries: MemoryEntry[]): Result<number[] | null> {
        try {
            const withEmbeddings = entries.filter(e => e.embedding);
            if (withEmbeddings.length === 0) return ok(null);

            const dimension = withEmbeddings[0]!.embedding!.length;
            const centroid = new Array(dimension).fill(0) as number[];

            for (const entry of withEmbeddings) {
                for (let i = 0; i < dimension; i++) {
                    centroid[i] += entry.embedding![i]!;
                }
            }

            for (let i = 0; i < dimension; i++) {
                centroid[i] /= withEmbeddings.length;
            }

            // Normalize
            const magnitude = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
            if (magnitude > 0) {
                for (let i = 0; i < dimension; i++) {
                    centroid[i] /= magnitude;
                }
            }

            return ok(centroid);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Deduplicate entries based on semantic similarity
     * Returns unique entries, filtering out near-duplicates
     */
    deduplicate(entries: MemoryEntry[], threshold?: number): MemoryEntry[] {
        const similarityThreshold = threshold ?? 0.95;
        const unique: MemoryEntry[] = [];

        for (const entry of entries) {
            if (!entry.embedding) {
                unique.push(entry);
                continue;
            }

            let isDuplicate = false;
            for (const existing of unique) {
                if (!existing.embedding) continue;

                const similarity = this.cosineSimilarity(entry.embedding, existing.embedding);
                if (similarity >= similarityThreshold) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                unique.push(entry);
            }
        }

        return unique;
    }

    // Private methods

    /**
     * Compute cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
        }

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i]! * b[i]!;
            magnitudeA += a[i]! * a[i]!;
            magnitudeB += b[i]! * b[i]!;
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }
}

// Re-export from store
export { MemoryStore } from './store.js';
export type { MemoryStoreConfig } from './store.js';
