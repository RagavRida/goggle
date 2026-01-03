/**
 * Active Memory Kernel for ContextOS
 * 
 * Demonstrates the full memory lifecycle:
 * Routing → Gating → Compounding → Storage → Retrieval → Injection
 * 
 * This is a complete simulation that can run without external dependencies.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// 1. THE SCHEMA (Rich Memory Objects)
// ============================================================================

interface MemoryControl {
    alpha: number;          // Health/Strength (0-1)
    accessCount: number;
    lastAccessed: number;   // Timestamp
    status: 'active' | 'archived';
}

interface MemoryProvenance {
    sourceIds: string[];
    confidence: number;
}

interface MemoryItem {
    id: string;
    content: string;
    vector: number[];
    control: MemoryControl;
    provenance: MemoryProvenance;
}

interface BufferItem {
    id: string;
    text: string;
    vector: number[];
}

// ============================================================================
// 2. MOCK INFRASTRUCTURE (Simulators)
// ============================================================================

/**
 * Mock Embedder - Simulates semantic vectors
 * Uses keyword-based similarity to produce realistic behavior
 * In production: Replace with Gemini text-embedding-004
 */
class MockEmbedder {
    private dimension = 128;

    // Semantic clusters for demo purposes
    private semanticClusters: Array<{ keywords: string[]; baseVector: number[] }>;

    constructor() {
        // Pre-generate base vectors for semantic clusters
        this.semanticClusters = [
            { keywords: ['peanut', 'peanuts', 'allergy', 'allergic', 'hate', 'avoid'], baseVector: this.seededRandom(1001, this.dimension) },
            { keywords: ['chocolate', 'dark', 'sweet', 'prefer', 'like', 'love'], baseVector: this.seededRandom(2002, this.dimension) },
            { keywords: ['eat', 'food', 'snickers', 'bar', 'candy', 'snack'], baseVector: this.seededRandom(3003, this.dimension) },
        ];
    }

    embed(text: string): number[] {
        const lower = text.toLowerCase();
        const tokens = lower.split(/\W+/);

        // Start with random base vector
        const baseHash = this.hashCode(text);
        const vector = this.seededRandom(baseHash, this.dimension);

        // Blend in semantic cluster vectors based on keyword matches
        for (const cluster of this.semanticClusters) {
            const matchCount = cluster.keywords.filter(kw =>
                tokens.includes(kw) || lower.includes(kw)
            ).length;

            if (matchCount > 0) {
                // Blend cluster vector into result (stronger for more matches)
                const blendFactor = Math.min(0.8, matchCount * 0.3);
                for (let i = 0; i < this.dimension; i++) {
                    vector[i] = vector[i]! * (1 - blendFactor) + cluster.baseVector[i]! * blendFactor;
                }
            }
        }

        // Normalize the vector
        const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        return vector.map(v => v / norm);
    }

    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    private seededRandom(seed: number, length: number): number[] {
        const result: number[] = [];
        let s = seed;
        for (let i = 0; i < length; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            result.push(s / 0x7fffffff);
        }
        return result;
    }
}

/**
 * Mock Vector Database - Simulates Pinecone/Milvus
 */
class MockVectorDB {
    private store: Map<string, MemoryItem> = new Map();

    add(item: MemoryItem): void {
        this.store.set(item.id, item);
    }

    search(queryVec: number[], topK = 3): MemoryItem[] {
        if (this.store.size === 0) return [];

        const results: Array<{ score: number; item: MemoryItem }> = [];

        for (const item of this.store.values()) {
            const score = this.cosineSimilarity(queryVec, item.vector);
            results.push({ score, item });
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK).map(r => r.item);
    }

    size(): number {
        return this.store.size;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i]! * b[i]!;
            normA += a[i]! * a[i]!;
            normB += b[i]! * b[i]!;
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }
}

/**
 * Mock LLM - Simulates Gemini/GPT
 */
class MockLLM {
    generate(prompt: string, context: string): string {
        if (context) {
            // Extract the key facts from context for a smarter response
            const hasAllergy = context.toLowerCase().includes('allerg');
            const hasPeanut = context.toLowerCase().includes('peanut');

            if (hasPeanut && hasAllergy && prompt.toLowerCase().includes('snickers')) {
                return `⚠️ WARNING: Based on your stored memories, you have a peanut allergy. Snickers bars contain peanuts - I would NOT recommend eating them.`;
            }
            return `[LLM Response] I found relevant memories and will use them to answer: "${prompt.slice(0, 40)}..."`;
        }
        return `[LLM Response] Processing: "${prompt.slice(0, 30)}..."`;
    }
}

// ============================================================================
// 3. THE ACTIVE MEMORY KERNEL
// ============================================================================

interface KernelConfig {
    gatingThreshold?: number;    // Entropy threshold for gating
    bufferFlushSize?: number;    // Buffer size before compounding
    minAlpha?: number;           // Minimum alpha for retrieval
}

type RouteType = 'fast_path' | 'memory_aware';

class ActiveMemoryKernel {
    private embedder: MockEmbedder;
    private vdb: MockVectorDB;
    private llm: MockLLM;
    private buffer: BufferItem[] = [];

    private gatingThreshold: number;
    private bufferFlushSize: number;
    private minAlpha: number;

    constructor(config: KernelConfig = {}) {
        this.embedder = new MockEmbedder();
        this.vdb = new MockVectorDB();
        this.llm = new MockLLM();

        this.gatingThreshold = config.gatingThreshold ?? 0.15;
        this.bufferFlushSize = config.bufferFlushSize ?? 2;
        this.minAlpha = config.minAlpha ?? 0.3;
    }

    // =========================================================================
    // A. ROUTER (Fast Path vs Memory-Aware Path)
    // =========================================================================

    private router(userInput: string): RouteType {
        const words = userInput.trim().split(/\s+/);
        const lower = userInput.toLowerCase();

        // Fast path: Short greetings don't need memory
        if (words.length < 3 && (lower.includes('hi') || lower.includes('hello'))) {
            return 'fast_path';
        }

        return 'memory_aware';
    }

    // =========================================================================
    // B. GATING (Significance Filter)
    // =========================================================================

    private calculateEntropy(vector: number[]): { entropy: number; similarity: number } {
        /**
         * Geometric Proxy: How 'new' is this information?
         * Uses orthogonal residual - high similarity = low entropy (redundant)
         */
        const nearest = this.vdb.search(vector, 1);

        if (nearest.length === 0) {
            return { entropy: 1.0, similarity: 0 }; // Total novelty (Cold Start)
        }

        // Calculate residual (1 - cosine similarity)
        const nearestVec = nearest[0]!.vector;
        const similarity = this.cosineSimilarity(vector, nearestVec);
        return { entropy: 1.0 - similarity, similarity };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i]! * b[i]!;
            normA += a[i]! * a[i]!;
            normB += b[i]! * b[i]!;
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    // =========================================================================
    // C. WRITE PATH (Ingest & Compound)
    // =========================================================================

    private observe(userInput: string): void {
        console.log(`\n>> Observing: '${userInput}'`);
        const vector = this.embedder.embed(userInput);
        const { entropy, similarity } = this.calculateEntropy(vector);

        if (entropy > this.gatingThreshold) {
            console.log(`   [Gate: OPEN] Entropy ${entropy.toFixed(2)} (sim: ${similarity.toFixed(2)}) > ${this.gatingThreshold}. Added to buffer.`);
            this.buffer.push({
                id: uuidv4(),
                text: userInput,
                vector,
            });

            // Trigger Compounding if buffer gets full
            if (this.buffer.length >= this.bufferFlushSize) {
                this.compoundMemory();
            }
        } else {
            console.log(`   [Gate: CLOSED] Entropy ${entropy.toFixed(2)} (similarity: ${similarity.toFixed(2)}). Information is redundant.`);
        }
    }

    private compoundMemory(): void {
        console.log('   [Process: COMPOUNDING] Compressing buffer into Long-Term Memory...');

        /**
         * In production: Send buffer to LLM to synthesize a single rule.
         * Simulation: Combine texts into a synthesized rule.
         */
        const combinedTexts = this.buffer.map(b => b.text).join(' | ');
        const synthesizedContent = `RULE: ${combinedTexts} (Synthesized from ${this.buffer.length} observations)`;

        // Create compounded memory item
        const newItem: MemoryItem = {
            id: uuidv4(),
            content: synthesizedContent,
            vector: this.buffer[0]!.vector, // Use first vector (simplified)
            control: {
                alpha: 1.0,
                accessCount: 0,
                lastAccessed: Date.now(),
                status: 'active',
            },
            provenance: {
                sourceIds: this.buffer.map(b => b.id),
                confidence: 1.0,
            },
        };

        this.vdb.add(newItem);
        this.buffer = []; // Flush buffer
        console.log(`   [DB Write] Stored Rule: ${newItem.content}`);
    }

    // =========================================================================
    // D. READ PATH (Retrieve & Inject)
    // =========================================================================

    private retrieveContext(userInput: string): string {
        // 1. Query Transformation (HyDE-style)
        const searchQuery = `User facts related to: ${userInput}`;
        const queryVec = this.embedder.embed(searchQuery);

        // 2. Vector Search
        const hits = this.vdb.search(queryVec, 3);

        // 3. Serialization (XML View)
        const xmlBlocks: string[] = [];

        for (const hit of hits) {
            // Alpha Check (Garbage Collection)
            if (hit.control.alpha < this.minAlpha) continue;

            // Format as XML block
            xmlBlocks.push(
                `  <fact id="${hit.id.slice(0, 8)}" confidence="${hit.control.alpha.toFixed(2)}">${hit.content}</fact>`
            );

            // Touch Access (Reinforcement Learning)
            hit.control.lastAccessed = Date.now();
            hit.control.accessCount += 1;
        }

        if (xmlBlocks.length === 0) {
            return '';
        }

        return '<memory_block>\n' + xmlBlocks.join('\n') + '\n</memory_block>';
    }

    // =========================================================================
    // MAIN PIPELINE
    // =========================================================================

    chat(userInput: string): void {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`User: ${userInput}`);
        console.log('─'.repeat(60));

        // 1. Route
        const route = this.router(userInput);
        console.log(`   [Route: ${route.toUpperCase()}]`);

        if (route === 'fast_path') {
            console.log('LLM: Hi there! (Fast Path - No Memory Access)');
            return;
        }

        // 2. Retrieve (Read Path)
        const context = this.retrieveContext(userInput);

        // 3. Generate Response
        const response = this.llm.generate(userInput, context);
        console.log(`\nLLM: ${response}`);

        if (context) {
            console.log(`\n📦 Context Injected:\n${context}`);
        } else {
            console.log('\n📦 Context: (none - cold start or no matches)');
        }

        // 4. Observe (Write Path - async in production)
        this.observe(userInput);
    }

    // Stats
    stats(): { dbSize: number; bufferSize: number } {
        return {
            dbSize: this.vdb.size(),
            bufferSize: this.buffer.length,
        };
    }
}

// ============================================================================
// 4. DEMO SIMULATION
// ============================================================================

function main() {
    console.log('═'.repeat(70));
    console.log('  ACTIVE MEMORY KERNEL - Full Lifecycle Demo');
    console.log('  Routing → Gating → Compounding → Storage → Retrieval → Injection');
    console.log('═'.repeat(70));

    const kernel = new ActiveMemoryKernel({
        gatingThreshold: 0.15,
        bufferFlushSize: 2,
    });

    // --- TURN 1: Cold Start ---
    console.log('\n\n🔵 TURN 1: Cold Start');
    kernel.chat('I am allergic to peanuts.');
    console.log(`   📊 Stats: ${JSON.stringify(kernel.stats())}`);
    // Buffer: 1 item. Not flushed yet.

    // --- TURN 2: Accumulation ---
    console.log('\n\n🔵 TURN 2: Accumulation');
    kernel.chat('Also, I prefer dark chocolate.');
    console.log(`   📊 Stats: ${JSON.stringify(kernel.stats())}`);
    // Buffer: 2 items -> Trigger Compounding -> DB Write.

    // --- TURN 3: Redundancy Check ---
    console.log('\n\n🔵 TURN 3: Redundancy Check (Gate Should CLOSE)');
    kernel.chat('I really hate peanuts.');
    console.log(`   📊 Stats: ${JSON.stringify(kernel.stats())}`);
    // Should detect high similarity to "allergic to peanuts" and GATE CLOSE.

    // --- TURN 4: Retrieval ---
    console.log('\n\n🔵 TURN 4: Retrieval with Context Injection');
    kernel.chat('Can I eat a Snickers bar?');
    console.log(`   📊 Stats: ${JSON.stringify(kernel.stats())}`);
    // Should retrieve the compounded rule about peanuts.

    // --- TURN 5: Fast Path ---
    console.log('\n\n🔵 TURN 5: Fast Path (No Memory)');
    kernel.chat('Hi there!');
    // Should route to fast_path without memory access.

    console.log('\n\n' + '═'.repeat(70));
    console.log('  DEMO COMPLETE');
    console.log('═'.repeat(70));

    console.log(`
KEY BEHAVIORS DEMONSTRATED:

1. GATING: Turn 3 detected "I really hate peanuts" as semantically 
   similar to "allergic to peanuts" → Gate CLOSED (no redundancy)

2. COMPOUNDING: Turn 2 triggered buffer flush at size 2 →
   Synthesized rule written to vector DB

3. CONTEXT INJECTION: Turn 4 retrieved the peanut allergy rule →
   LLM warned about Snickers containing peanuts

4. FAST PATH: Turn 5 routed to immediate response →
   No memory read/write overhead
`);
}

main();
