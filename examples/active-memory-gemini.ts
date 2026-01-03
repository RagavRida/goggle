/**
 * Active Memory Kernel with Real Gemini Integration
 * 
 * Uses actual Gemini API for:
 * - Real semantic embeddings (text-embedding-004)
 * - Real LLM responses (gemini-2.0-flash)
 * 
 * Features retry logic for rate limiting.
 * 
 * Run: npx tsx examples/active-memory-gemini.ts
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Configuration
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBruofqNmN2FS4orE7WazoBM0Kc4Eo3tPc';
console.log('✅ API key configured');

const GATING_THRESHOLD = 0.15;
const BUFFER_FLUSH_SIZE = 2;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ============================================================================
// Schema
// ============================================================================

interface MemoryControl {
    alpha: number;
    accessCount: number;
    lastAccessed: number;
    status: 'active' | 'archived';
}

interface MemoryItem {
    id: string;
    content: string;
    vector: number[];
    control: MemoryControl;
    sourceIds: string[];
}

interface BufferItem {
    id: string;
    text: string;
    vector: number[];
}

// ============================================================================
// Retry Helper
// ============================================================================

async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    delayMs: number = RETRY_DELAY_MS
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if it's a rate limit error
            const isRateLimit = lastError.message.includes('429') ||
                lastError.message.includes('quota') ||
                lastError.message.includes('Too Many Requests');

            if (isRateLimit && attempt < maxRetries - 1) {
                const waitTime = delayMs * (attempt + 1);
                console.log(`   ⏳ Rate limited, waiting ${waitTime}ms before retry ${attempt + 2}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else if (!isRateLimit) {
                throw lastError;
            }
        }
    }

    throw lastError;
}

// ============================================================================
// Gemini Services
// ============================================================================

class GeminiEmbedder {
    private genAI: GoogleGenerativeAI;
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    }

    async embed(text: string): Promise<number[]> {
        return withRetry(async () => {
            const result = await this.model.embedContent({
                content: { parts: [{ text }], role: 'user' },
            });
            return result.embedding.values;
        });
    }
}

class GeminiLLM {
    private genAI: GoogleGenerativeAI;
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    }

    async generate(prompt: string, context: string): Promise<string> {
        const fullPrompt = context
            ? `You have access to the following memories about the user:\n\n${context}\n\nUser: ${prompt}\n\nRespond helpfully, concisely, and reference relevant memories if applicable.`
            : `User: ${prompt}\n\nRespond helpfully and concisely.`;

        return withRetry(async () => {
            const result = await this.model.generateContent(fullPrompt);
            return result.response.text();
        });
    }
}

// ============================================================================
// Vector Database (In-Memory)
// ============================================================================

class VectorDB {
    private store: Map<string, MemoryItem> = new Map();

    add(item: MemoryItem): void {
        this.store.set(item.id, item);
    }

    search(queryVec: number[], topK = 3): Array<{ item: MemoryItem; score: number }> {
        if (this.store.size === 0) return [];

        const results: Array<{ score: number; item: MemoryItem }> = [];

        for (const item of this.store.values()) {
            const score = this.cosineSimilarity(queryVec, item.vector);
            results.push({ score, item });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
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

// ============================================================================
// Active Memory Kernel
// ============================================================================

class ActiveMemoryKernel {
    private embedder: GeminiEmbedder;
    private llm: GeminiLLM;
    private vdb: VectorDB;
    private buffer: BufferItem[] = [];

    constructor(apiKey: string) {
        this.embedder = new GeminiEmbedder(apiKey);
        this.llm = new GeminiLLM(apiKey);
        this.vdb = new VectorDB();
    }

    // Router
    private router(input: string): 'fast_path' | 'memory_aware' {
        const words = input.trim().split(/\s+/);
        const lower = input.toLowerCase();
        if (words.length < 3 && (lower.includes('hi') || lower.includes('hello'))) {
            return 'fast_path';
        }
        return 'memory_aware';
    }

    // Gating
    private async calculateEntropy(vector: number[]): Promise<{ entropy: number; similarity: number }> {
        const hits = this.vdb.search(vector, 1);
        if (hits.length === 0) {
            return { entropy: 1.0, similarity: 0 };
        }
        const similarity = hits[0]!.score;
        return { entropy: 1.0 - similarity, similarity };
    }

    // Write Path
    private async observe(input: string): Promise<void> {
        console.log(`\n>> Observing: '${input}'`);

        try {
            const vector = await this.embedder.embed(input);
            const { entropy, similarity } = await this.calculateEntropy(vector);

            if (entropy > GATING_THRESHOLD) {
                console.log(`   [Gate: OPEN] Entropy ${entropy.toFixed(2)} (sim: ${similarity.toFixed(2)}) > ${GATING_THRESHOLD}`);
                this.buffer.push({ id: uuidv4(), text: input, vector });

                if (this.buffer.length >= BUFFER_FLUSH_SIZE) {
                    await this.compound();
                }
            } else {
                console.log(`   [Gate: CLOSED] Entropy ${entropy.toFixed(2)} (sim: ${similarity.toFixed(2)}). Redundant.`);
            }
        } catch (error) {
            console.log(`   [Gate: ERROR] ${error instanceof Error ? error.message.slice(0, 80) : 'Unknown error'}...`);
        }
    }

    private async compound(): Promise<void> {
        console.log('   [COMPOUNDING] Synthesizing memories...');

        const combinedText = this.buffer.map(b => b.text).join(' | ');
        const synthesized = `RULE: ${combinedText}`;

        const item: MemoryItem = {
            id: uuidv4(),
            content: synthesized,
            vector: this.buffer[0]!.vector,
            control: { alpha: 1.0, accessCount: 0, lastAccessed: Date.now(), status: 'active' },
            sourceIds: this.buffer.map(b => b.id),
        };

        this.vdb.add(item);
        this.buffer = [];
        console.log(`   [DB Write] ${synthesized}`);
    }

    // Read Path
    private async retrieveContext(input: string): Promise<string> {
        try {
            const vector = await this.embedder.embed(input);
            const hits = this.vdb.search(vector, 3);

            if (hits.length === 0) return '';

            const blocks = hits
                .filter(h => h.item.control.alpha >= 0.3)
                .map(h => `<fact confidence="${h.score.toFixed(2)}">${h.item.content}</fact>`);

            return blocks.length > 0 ? `<memory_block>\n${blocks.join('\n')}\n</memory_block>` : '';
        } catch {
            return '';
        }
    }

    // Main Pipeline
    async chat(input: string): Promise<void> {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`User: ${input}`);
        console.log('─'.repeat(60));

        const route = this.router(input);
        console.log(`   [Route: ${route.toUpperCase()}]`);

        if (route === 'fast_path') {
            console.log('\nLLM: Hi there! 👋');
            return;
        }

        // Retrieve context
        const context = await this.retrieveContext(input);
        if (context) {
            console.log(`\n📦 Context:\n${context}`);
        }

        // Generate response
        console.log('\n🤖 LLM Response:');
        try {
            const response = await this.llm.generate(input, context);
            console.log(response);
        } catch (error) {
            console.log(`[Error: ${error instanceof Error ? error.message.slice(0, 100) : 'Unknown'}...]`);
        }

        // Observe for future memory
        await this.observe(input);
    }

    stats(): { dbSize: number; bufferSize: number } {
        return { dbSize: this.vdb.size(), bufferSize: this.buffer.length };
    }
}

// ============================================================================
// Demo
// ============================================================================

async function main() {
    console.log('═'.repeat(70));
    console.log('  ACTIVE MEMORY KERNEL - Real Gemini Integration');
    console.log('═'.repeat(70));

    const kernel = new ActiveMemoryKernel(GEMINI_API_KEY);

    const conversations = [
        { turn: '1: Cold Start', message: 'I am allergic to peanuts.' },
        { turn: '2: Accumulation', message: 'I also prefer dark chocolate.' },
        { turn: '3: Redundancy Test', message: 'I really hate peanuts, they make me sick.' },
        { turn: '4: Context Retrieval', message: 'Can I eat a Snickers bar?' },
        { turn: '5: Fast Path', message: 'Hi!' },
    ];

    for (const { turn, message } of conversations) {
        console.log(`\n\n🔵 TURN ${turn}`);
        await kernel.chat(message);
        console.log(`   📊 ${JSON.stringify(kernel.stats())}`);

        // Add delay between turns to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('\n\n' + '═'.repeat(70));
    console.log('  DEMO COMPLETE');
    console.log('═'.repeat(70));
}

main().catch(console.error);
