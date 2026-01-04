/**
 * Gemini API Client
 * 
 * Typed wrapper for Gemini API with retries and rate limiting.
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GeminiConfig, GeminiRequest, GeminiResponse, Result, ok, err } from '../types/index.js';

export interface ClientConfig {
    apiKey: string;
    defaultModel?: 'gemini-2.0-flash' | 'gemini-2.0-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro' | 'gemini-flash-latest';
    maxRetries?: number;
    retryDelayMs?: number;
    rateLimitRpm?: number; // Requests per minute
}

interface RateLimitState {
    tokens: number;
    lastRefill: number;
}

export class GeminiClient {
    private genAI: GoogleGenerativeAI;
    private models: Map<string, GenerativeModel> = new Map();
    private defaultModel: string;
    private maxRetries: number;
    private retryDelay: number;
    private rateLimit: RateLimitState;
    private rateLimitRpm: number;

    constructor(config: ClientConfig) {
        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.defaultModel = config.defaultModel ?? 'gemini-2.0-flash';
        this.maxRetries = config.maxRetries ?? 3;
        this.retryDelay = config.retryDelayMs ?? 1000;
        this.rateLimitRpm = config.rateLimitRpm ?? 60;
        this.rateLimit = {
            tokens: this.rateLimitRpm,
            lastRefill: Date.now(),
        };
    }

    /**
     * Generate text response
     */
    async generate(request: GeminiRequest): Promise<Result<GeminiResponse>> {
        // Rate limiting
        await this.waitForRateLimit();

        const modelName = request.config?.model ?? this.defaultModel;
        const model = this.getModel(modelName);

        const startTime = Date.now();
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // Build prompt with optional system instruction and context
                let fullPrompt = '';

                if (request.context && request.context.length > 0) {
                    fullPrompt += '## Context\n\n' + request.context.join('\n\n') + '\n\n';
                }

                fullPrompt += request.prompt;

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                    systemInstruction: request.systemInstruction,
                    generationConfig: {
                        maxOutputTokens: request.config?.maxTokens ?? 8192,
                        temperature: request.config?.temperature ?? 0.7,
                        topP: request.config?.topP ?? 0.95,
                        topK: request.config?.topK ?? 40,
                    },
                });

                const response = result.response;
                const text = response.text();
                const latencyMs = Date.now() - startTime;

                // Estimate token counts (rough approximation)
                const promptTokens = Math.ceil(fullPrompt.length / 4);
                const responseTokens = Math.ceil(text.length / 4);

                return ok({
                    text,
                    tokenCount: {
                        prompt: promptTokens,
                        response: responseTokens,
                        total: promptTokens + responseTokens,
                    },
                    cached: false,
                    latencyMs,
                });
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if retryable
                if (this.isRetryable(lastError) && attempt < this.maxRetries) {
                    await this.delay(this.retryDelay * Math.pow(2, attempt));
                    continue;
                }

                break;
            }
        }

        return err(lastError ?? new Error('Unknown error'));
    }

    /**
     * Simple generation with just a prompt
     */
    async prompt(text: string, model?: 'gemini-2.0-flash' | 'gemini-2.0-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro' | 'gemini-flash-latest'): Promise<Result<string>> {
        const result = await this.generate({
            prompt: text,
            config: model ? { apiKey: '', model } : undefined,
        });

        if (!result.ok) return result;
        return ok(result.value.text);
    }

    /**
     * Check API connectivity
     */
    async healthCheck(): Promise<Result<boolean>> {
        try {
            const result = await this.prompt('Say "ok"');
            return ok(result.ok);
        } catch {
            return ok(false);
        }
    }

    // Private methods

    private getModel(modelName: string): GenerativeModel {
        let model = this.models.get(modelName);
        if (!model) {
            model = this.genAI.getGenerativeModel({ model: modelName });
            this.models.set(modelName, model);
        }
        return model;
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.rateLimit.lastRefill;
        const refillAmount = Math.floor(elapsed / 60000) * this.rateLimitRpm;

        if (refillAmount > 0) {
            this.rateLimit.tokens = Math.min(this.rateLimitRpm, this.rateLimit.tokens + refillAmount);
            this.rateLimit.lastRefill = now;
        }

        if (this.rateLimit.tokens <= 0) {
            const waitTime = 60000 - elapsed;
            await this.delay(waitTime);
            this.rateLimit.tokens = this.rateLimitRpm;
            this.rateLimit.lastRefill = Date.now();
        }

        this.rateLimit.tokens--;
    }

    private isRetryable(error: Error): boolean {
        const message = error.message.toLowerCase();
        return (
            message.includes('rate limit') ||
            message.includes('quota') ||
            message.includes('timeout') ||
            message.includes('503') ||
            message.includes('429')
        );
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
