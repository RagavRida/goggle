/**
 * ContextOS Core Type Definitions
 * 
 * Shared types for memory, agents, messages, and kernel state.
 */

import { z } from 'zod';

// ============================================================================
// Memory Types
// ============================================================================

export const MemoryTypeSchema = z.enum(['fact', 'decision', 'observation', 'artifact', 'context']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemoryMetadataSchema = z.object({
    agentId: z.string(),
    taskId: z.string(),
    timestamp: z.number(),
    ttl: z.number().optional(),
    tags: z.array(z.string()),
    priority: z.number().min(0).max(10).default(5),
    version: z.number().default(1),
});
export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>;

export const MemoryEntrySchema = z.object({
    id: z.string().uuid(),
    type: MemoryTypeSchema,
    content: z.record(z.unknown()),
    embedding: z.array(z.number()).optional(),
    metadata: MemoryMetadataSchema,
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export interface MemoryQuery {
    types?: MemoryType[];
    agentId?: string;
    taskId?: string;
    tags?: string[];
    since?: number;
    until?: number;
    limit?: number;
    offset?: number;
}

export interface SemanticQuery extends MemoryQuery {
    embedding: number[];
    threshold?: number; // Minimum similarity score (0-1)
}

// ============================================================================
// Agent Types
// ============================================================================

export const AgentStateSchema = z.enum(['idle', 'busy', 'blocked', 'offline']);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentCapabilitySchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentDescriptorSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    capabilities: z.array(z.string()),
    state: AgentStateSchema,
    config: z.record(z.unknown()),
    lastSeen: z.number(),
    metadata: z.record(z.unknown()).optional(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

// ============================================================================
// Message Types
// ============================================================================

export const MessageTypeSchema = z.enum([
    'request',
    'response',
    'event',
    'command',
    'query',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
    id: z.string().uuid(),
    type: MessageTypeSchema,
    from: z.string(),
    to: z.string(), // Agent ID or '*' for broadcast
    payload: z.unknown(),
    timestamp: z.number(),
    replyTo: z.string().uuid().optional(),
    correlationId: z.string().uuid().optional(),
    ttl: z.number().optional(),
});
export type Message<T = unknown> = Omit<z.infer<typeof MessageSchema>, 'payload'> & { payload: T };

// ============================================================================
// Kernel Types
// ============================================================================

export const KernelStateSchema = z.enum([
    'idle',
    'planning',
    'executing',
    'verifying',
    'blocked',
    'error',
]);
export type KernelState = z.infer<typeof KernelStateSchema>;

export const TaskStatusSchema = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    status: TaskStatusSchema,
    agentId: z.string().optional(),
    parentTaskId: z.string().uuid().optional(),
    input: z.unknown(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    completedAt: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// Gemini Types
// ============================================================================

export interface GeminiConfig {
    apiKey: string;
    model: 'gemini-2.0-flash' | 'gemini-2.0-pro';
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
}

export interface GeminiRequest {
    prompt: string;
    systemInstruction?: string;
    context?: string[];
    config?: Partial<GeminiConfig>;
}

export interface GeminiResponse {
    text: string;
    tokenCount: {
        prompt: number;
        response: number;
        total: number;
    };
    cached: boolean;
    latencyMs: number;
}

export interface EmbeddingRequest {
    texts: string[];
    model?: string;
}

export interface EmbeddingResponse {
    embeddings: number[][];
    cached: boolean;
    latencyMs: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
    | 'memory:created'
    | 'memory:updated'
    | 'memory:deleted'
    | 'memory:retrieved'
    | 'cache:hit'
    | 'gemini:skipped'
    | 'agent:registered'
    | 'agent:deregistered'
    | 'agent:state_changed'
    | 'task:created'
    | 'task:started'
    | 'task:completed'
    | 'task:failed'
    | 'kernel:state_changed';

export interface Event<T = unknown> {
    type: EventType;
    timestamp: number;
    payload: T;
    source: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Result<T, E = Error> =
    | { ok: true; value: T }
    | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
    return { ok: false, error };
}
