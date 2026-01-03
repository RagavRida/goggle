/**
 * ContextOS - Shared Memory and Decision Kernel for Gemini Agents
 * 
 * Main entry point and unified API.
 */

import Database from 'better-sqlite3';
import { MemoryStore, MemoryIndex } from './memory/index.js';
import { initializeDatabase } from './memory/schema.js';
import { ContextRetriever } from './context/retriever.js';
import { ContextRanker } from './context/ranker.js';
import { DecisionKernel } from './kernel/kernel.js';
import { IntentRouter } from './kernel/router.js';
import { TaskScheduler } from './kernel/scheduler.js';
import { AgentRegistry } from './agents/registry.js';
import { GeminiClient } from './gemini/client.js';
import { ResponseCache } from './gemini/cache.js';
import { EmbeddingsService } from './gemini/embeddings.js';
import { MessageBus } from './bus/bus.js';
import { Event } from './types/index.js';
import { GitHubConnector } from './agents/github-connector.js';

export interface ContextOSConfig {
    dbPath?: string;
    geminiApiKey?: string;
    geminiModel?: 'gemini-2.0-flash' | 'gemini-2.0-pro';
    githubToken?: string;
    cacheSize?: number;
    maxConcurrentTasks?: number;
    onEvent?: (event: Event) => void;
}

export class ContextOS {
    // Core components
    readonly db: Database.Database;
    readonly memory: MemoryStore;
    readonly memoryIndex: MemoryIndex;
    readonly retriever: ContextRetriever;
    readonly ranker: ContextRanker;
    readonly kernel: DecisionKernel;
    readonly router: IntentRouter;
    readonly scheduler: TaskScheduler;
    readonly registry: AgentRegistry;
    readonly bus: MessageBus;

    // Optional integrations
    readonly gemini?: GeminiClient;
    readonly github?: GitHubConnector;
    readonly cache?: ResponseCache;
    readonly embeddings?: EmbeddingsService;

    private onEvent?: (event: Event) => void;

    constructor(config: ContextOSConfig = {}) {
        const dbPath = config.dbPath ?? ':memory:';
        this.onEvent = config.onEvent;

        // Initialize database
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');

        // Initialize all schemas
        initializeDatabase(this.db);

        // Initialize memory layer
        this.memory = new MemoryStore({
            dbPath,
            cacheSize: config.cacheSize ?? 1000,
        });

        this.memoryIndex = new MemoryIndex({
            store: this.memory,
        });

        // Initialize context layer
        this.retriever = new ContextRetriever({
            store: this.memory,
            index: this.memoryIndex,
        });

        this.ranker = new ContextRanker({
            index: this.memoryIndex,
        });

        // Initialize kernel layer
        this.kernel = new DecisionKernel({
            maxConcurrentTasks: config.maxConcurrentTasks ?? 5,
            onEvent: this.handleEvent.bind(this),
        });

        this.router = new IntentRouter();

        this.scheduler = new TaskScheduler({
            maxConcurrent: config.maxConcurrentTasks ?? 5,
        });

        // Initialize agent layer
        this.registry = new AgentRegistry({
            db: this.db,
            onEvent: this.handleEvent.bind(this),
        });

        // Initialize message bus
        this.bus = new MessageBus({
            db: this.db,
        });

        // Initialize Gemini integration
        if (config.geminiApiKey) {
            this.gemini = new GeminiClient({
                apiKey: config.geminiApiKey,
                defaultModel: config.geminiModel ?? 'gemini-2.0-flash',
            });

            this.cache = new ResponseCache({
                db: this.db,
            });

            this.embeddings = new EmbeddingsService({
                apiKey: config.geminiApiKey,
                db: this.db,
            });
        }

        // Initialize GitHub integration
        if (config.githubToken) {
            this.github = new GitHubConnector({
                token: config.githubToken,
            });

            // Register GitHub Agent
            this.registry.register(
                'GitHub Connector',
                ['github', 'issues', 'pr'],
                { description: 'Provides access to GitHub issues and pull requests' }
            );
        }
    }

    /**
     * Generate embedding for text (if Gemini configured)
     */
    async embed(text: string): Promise<number[] | null> {
        if (!this.embeddings) return null;
        const result = await this.embeddings.embedOne(text);
        return result.ok ? result.value : null;
    }

    /**
     * Store a memory with optional embedding generation
     */
    async remember(
        type: 'fact' | 'decision' | 'observation' | 'artifact' | 'context',
        content: Record<string, unknown>,
        agentId: string,
        taskId: string,
        options?: {
            tags?: string[];
            priority?: number;
            ttl?: number;
            generateEmbedding?: boolean;
        }
    ) {
        let embedding: number[] | undefined;

        if (options?.generateEmbedding && this.embeddings) {
            const text = JSON.stringify(content);
            embedding = (await this.embed(text)) ?? undefined;
        }

        return this.memory.create(type, content, agentId, taskId, {
            ...options,
            embedding,
        });
    }

    /**
     * Retrieve relevant context
     */
    async recall(options: {
        query?: string;
        agentId?: string;
        taskId?: string;
        tags?: string[];
        limit?: number;
    }) {
        let embedding: number[] | undefined;

        if (options.query && this.embeddings) {
            embedding = (await this.embed(options.query)) ?? undefined;
        }

        return this.retriever.retrieve({
            ...options,
            embedding,
        });
    }

    /**
     * Get system statistics
     */
    stats() {
        const memoryStats = this.memory.stats();
        const kernelStats = this.kernel.stats();
        const registryStats = this.registry.stats();
        const busStats = this.bus.stats();

        return {
            memory: memoryStats.ok ? memoryStats.value : null,
            kernel: kernelStats,
            registry: registryStats.ok ? registryStats.value : null,
            bus: busStats.ok ? busStats.value : null,
            gemini: this.cache ? this.cache.stats() : null,
        };
    }

    /**
     * Shutdown and cleanup
     */
    shutdown(): void {
        this.registry.stop();
        this.memory.close();
        this.db.close();
    }

    // Private methods

    private handleEvent(event: Event): void {
        this.onEvent?.(event);
    }
}

// Re-export all components
export * from './types/index.js';
export { MemoryStore, MemoryIndex } from './memory/index.js';
export type { ScoredEntry, MemoryStoreConfig } from './memory/index.js';
export { ContextRetriever } from './context/retriever.js';
export type { RetrievalRequest, RetrievalResult } from './context/retriever.js';
export { ContextRanker } from './context/ranker.js';
export type { RankerConfig, RankedEntry } from './context/ranker.js';
export { DecisionKernel } from './kernel/kernel.js';
export type { KernelConfig } from './kernel/kernel.js';
export { IntentRouter } from './kernel/router.js';
export type { Route, RoutePattern, RouteRequest, RouteMatch } from './kernel/router.js';
export { TaskScheduler } from './kernel/scheduler.js';
export type { SchedulerConfig, ScheduledTask } from './kernel/scheduler.js';
export { AgentRegistry } from './agents/registry.js';
export type { RegistryConfig } from './agents/registry.js';
export { GeminiClient } from './gemini/client.js';
export type { ClientConfig } from './gemini/client.js';
export { ResponseCache } from './gemini/cache.js';
export type { CacheConfig } from './gemini/cache.js';
export { EmbeddingsService } from './gemini/embeddings.js';
export type { EmbeddingsConfig } from './gemini/embeddings.js';
export { MessageBus } from './bus/bus.js';
export type { BusConfig } from './bus/bus.js';
