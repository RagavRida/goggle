/**
 * Context Retriever
 * 
 * Retrieves and assembles relevant context for agent decisions.
 * Combines semantic search with recency-weighted scoring.
 */

import { MemoryEntry, MemoryType, Result, ok, err } from '../types/index.js';
import { MemoryStore, MemoryIndex, ScoredEntry } from '../memory/index.js';

export interface RetrievalConfig {
    store: MemoryStore;
    index: MemoryIndex;
    maxTokens?: number; // Token budget for context
    recencyWeight?: number; // Weight for recency vs relevance (0-1)
    defaultLimit?: number;
}

export interface RetrievalRequest {
    query?: string;
    embedding?: number[];
    types?: MemoryType[];
    agentId?: string;
    taskId?: string;
    tags?: string[];
    limit?: number;
    recencyHours?: number; // Prefer entries from last N hours
}

export interface RetrievalResult {
    entries: ScoredEntry[];
    totalTokens: number;
    truncated: boolean;
}

export class ContextRetriever {
    private store: MemoryStore;
    private index: MemoryIndex;
    private maxTokens: number;
    private recencyWeight: number;
    private defaultLimit: number;

    constructor(config: RetrievalConfig) {
        this.store = config.store;
        this.index = config.index;
        this.maxTokens = config.maxTokens ?? 8000;
        this.recencyWeight = config.recencyWeight ?? 0.3;
        this.defaultLimit = config.defaultLimit ?? 20;
    }

    /**
     * Retrieve relevant context for a request
     */
    retrieve(request: RetrievalRequest): Result<RetrievalResult> {
        try {
            let scored: ScoredEntry[];

            if (request.embedding) {
                // Semantic retrieval
                const result = this.index.semanticSearch({
                    embedding: request.embedding,
                    types: request.types,
                    agentId: request.agentId,
                    taskId: request.taskId,
                    tags: request.tags,
                    threshold: 0.3,
                    limit: (request.limit ?? this.defaultLimit) * 2, // Get extra for re-ranking
                });

                if (!result.ok) return result as Result<RetrievalResult>;
                scored = result.value;
            } else {
                // Non-semantic retrieval based on filters
                const result = this.store.query({
                    types: request.types,
                    agentId: request.agentId,
                    taskId: request.taskId,
                    tags: request.tags,
                    limit: (request.limit ?? this.defaultLimit) * 2,
                });

                if (!result.ok) return result as Result<RetrievalResult>;
                scored = result.value.map(entry => ({ entry, score: 1.0 }));
            }

            // Apply recency weighting
            if (request.recencyHours) {
                const now = Date.now();
                const cutoff = now - (request.recencyHours * 60 * 60 * 1000);

                scored = scored.map(s => {
                    const age = now - s.entry.metadata.timestamp;
                    const maxAge = now - cutoff;
                    const recencyScore = Math.max(0, 1 - (age / maxAge));

                    const combinedScore =
                        (1 - this.recencyWeight) * s.score +
                        this.recencyWeight * recencyScore;

                    return { ...s, score: combinedScore };
                });

                // Re-sort by combined score
                scored.sort((a, b) => b.score - a.score);
            }

            // Apply priority boost
            scored = scored.map(s => ({
                ...s,
                score: s.score * (0.5 + (s.entry.metadata.priority / 20)),
            }));
            scored.sort((a, b) => b.score - a.score);

            // Limit results
            const limited = scored.slice(0, request.limit ?? this.defaultLimit);

            // Estimate token count and truncate if needed
            let totalTokens = 0;
            const finalEntries: ScoredEntry[] = [];
            let truncated = false;

            for (const s of limited) {
                const tokens = this.estimateTokens(s.entry);
                if (totalTokens + tokens > this.maxTokens) {
                    truncated = true;
                    break;
                }
                totalTokens += tokens;
                finalEntries.push(s);
            }

            return ok({
                entries: finalEntries,
                totalTokens,
                truncated,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Build context string from retrieved entries
     */
    buildContextString(entries: ScoredEntry[]): string {
        if (entries.length === 0) return '';

        const sections: string[] = [];

        for (const { entry, score } of entries) {
            const header = `[${entry.type.toUpperCase()}] (relevance: ${score.toFixed(2)})`;
            const content = JSON.stringify(entry.content, null, 2);
            const tags = entry.metadata.tags.length > 0
                ? `Tags: ${entry.metadata.tags.join(', ')}`
                : '';

            sections.push([header, content, tags].filter(Boolean).join('\n'));
        }

        return sections.join('\n\n---\n\n');
    }

    /**
     * Retrieve context as formatted string
     */
    retrieveAsString(request: RetrievalRequest): Result<{ context: string; metadata: RetrievalResult }> {
        const result = this.retrieve(request);
        if (!result.ok) return result as Result<{ context: string; metadata: RetrievalResult }>;

        const context = this.buildContextString(result.value.entries);
        return ok({ context, metadata: result.value });
    }

    /**
     * Get recent entries for an agent
     */
    getRecentForAgent(agentId: string, limit?: number): Result<MemoryEntry[]> {
        return this.store.query({
            agentId,
            limit: limit ?? 10,
        });
    }

    /**
     * Get recent entries for a task
     */
    getRecentForTask(taskId: string, limit?: number): Result<MemoryEntry[]> {
        return this.store.query({
            taskId,
            limit: limit ?? 10,
        });
    }

    // Private methods

    /**
     * Rough token estimation (4 chars per token)
     */
    private estimateTokens(entry: MemoryEntry): number {
        const content = JSON.stringify(entry.content);
        return Math.ceil(content.length / 4);
    }
}
