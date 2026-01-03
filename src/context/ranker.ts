/**
 * Context Ranker
 * 
 * Multi-signal ranking and deduplication for context entries.
 */

import { MemoryEntry, Result, ok, err } from '../types/index.js';
import { ScoredEntry, MemoryIndex } from '../memory/index.js';

export interface RankerConfig {
    index: MemoryIndex;
    weights?: {
        relevance?: number;
        recency?: number;
        priority?: number;
        diversity?: number;
    };
}

export interface RankingSignals {
    relevance: number; // Semantic similarity (0-1)
    recency: number; // Time-based score (0-1)
    priority: number; // Priority-based score (0-1)
    diversity: number; // Diversity contribution (0-1)
}

export interface RankedEntry extends ScoredEntry {
    signals: RankingSignals;
}

export class ContextRanker {
    private index: MemoryIndex;
    private weights: Required<NonNullable<RankerConfig['weights']>>;

    constructor(config: RankerConfig) {
        this.index = config.index;
        this.weights = {
            relevance: config.weights?.relevance ?? 0.4,
            recency: config.weights?.recency ?? 0.25,
            priority: config.weights?.priority ?? 0.2,
            diversity: config.weights?.diversity ?? 0.15,
        };
    }

    /**
     * Rank entries using multi-signal scoring
     */
    rank(entries: ScoredEntry[], options?: {
        queryTimestamp?: number;
        maxAgeHours?: number;
    }): Result<RankedEntry[]> {
        try {
            const now = options?.queryTimestamp ?? Date.now();
            const maxAge = (options?.maxAgeHours ?? 24 * 7) * 60 * 60 * 1000; // Default 1 week

            const ranked: RankedEntry[] = [];
            const selectedEmbeddings: number[][] = [];

            for (const scored of entries) {
                const { entry, score: relevance } = scored;

                // Recency signal
                const age = now - entry.metadata.timestamp;
                const recency = Math.max(0, 1 - (age / maxAge));

                // Priority signal (normalize 0-10 to 0-1)
                const priority = entry.metadata.priority / 10;

                // Diversity signal (similarity to already-selected entries)
                let diversity = 1.0;
                if (entry.embedding && selectedEmbeddings.length > 0) {
                    const maxSimilarity = this.maxSimilarityTo(entry.embedding, selectedEmbeddings);
                    diversity = 1 - maxSimilarity; // Higher diversity = lower similarity to selected
                }

                const signals: RankingSignals = { relevance, recency, priority, diversity };

                // Compute weighted score
                const finalScore =
                    this.weights.relevance * relevance +
                    this.weights.recency * recency +
                    this.weights.priority * priority +
                    this.weights.diversity * diversity;

                ranked.push({
                    entry,
                    score: finalScore,
                    signals,
                });

                if (entry.embedding) {
                    selectedEmbeddings.push(entry.embedding);
                }
            }

            // Sort by final score
            ranked.sort((a, b) => b.score - a.score);

            return ok(ranked);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Deduplicate entries based on semantic similarity
     */
    deduplicate(entries: MemoryEntry[], threshold?: number): MemoryEntry[] {
        return this.index.deduplicate(entries, threshold);
    }

    /**
     * Select diverse entries using maximal marginal relevance
     */
    selectDiverse(
        entries: ScoredEntry[],
        k: number,
        lambda?: number
    ): Result<ScoredEntry[]> {
        try {
            const diversityFactor = lambda ?? 0.5;
            const selected: ScoredEntry[] = [];
            const remaining = [...entries];
            const selectedEmbeddings: number[][] = [];

            while (selected.length < k && remaining.length > 0) {
                let bestIdx = 0;
                let bestScore = -Infinity;

                for (let i = 0; i < remaining.length; i++) {
                    const candidate = remaining[i]!;

                    // Relevance component (original score)
                    const relevance = candidate.score;

                    // Diversity component
                    let diversity = 1.0;
                    if (candidate.entry.embedding && selectedEmbeddings.length > 0) {
                        const maxSim = this.maxSimilarityTo(candidate.entry.embedding, selectedEmbeddings);
                        diversity = 1 - maxSim;
                    }

                    // MMR score
                    const mmrScore = diversityFactor * relevance + (1 - diversityFactor) * diversity;

                    if (mmrScore > bestScore) {
                        bestScore = mmrScore;
                        bestIdx = i;
                    }
                }

                const chosen = remaining.splice(bestIdx, 1)[0]!;
                selected.push(chosen);

                if (chosen.entry.embedding) {
                    selectedEmbeddings.push(chosen.entry.embedding);
                }
            }

            return ok(selected);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Truncate entries to fit within token budget
     */
    truncateToTokens(
        entries: ScoredEntry[],
        maxTokens: number,
        estimateTokens: (entry: MemoryEntry) => number
    ): ScoredEntry[] {
        const result: ScoredEntry[] = [];
        let totalTokens = 0;

        for (const entry of entries) {
            const tokens = estimateTokens(entry.entry);
            if (totalTokens + tokens > maxTokens) break;

            totalTokens += tokens;
            result.push(entry);
        }

        return result;
    }

    // Private methods

    private maxSimilarityTo(embedding: number[], others: number[][]): number {
        let maxSim = 0;
        for (const other of others) {
            const sim = this.cosineSimilarity(embedding, other);
            if (sim > maxSim) maxSim = sim;
        }
        return maxSim;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

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

        if (magnitudeA === 0 || magnitudeB === 0) return 0;

        return dotProduct / (magnitudeA * magnitudeB);
    }
}

export { ContextRetriever } from './retriever.js';
export type { RetrievalConfig, RetrievalRequest, RetrievalResult } from './retriever.js';
