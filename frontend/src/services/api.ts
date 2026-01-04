/**
 * ContextOS API Client
 * 
 * Frontend service for communicating with the ContextOS backend.
 */

const API_BASE = '/api';

export interface Stats {
    memory: {
        totalEntries: number;
        byType: Record<string, number>;
        cacheSize: number;
        cacheHitRate: number;
    } | null;
    kernel: {
        state: string;
        tasksByStatus: Record<string, number>;
        queueLength: number;
    };
    registry: {
        total: number;
        byState: Record<string, number>;
    } | null;
    bus: {
        totalMessages: number;
        pendingMessages: number;
        subscriptions: number;
    } | null;
    gemini: unknown;
}

export interface Task {
    id: string;
    name: string;
    description?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    input: unknown;
    output?: unknown;
    error?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
}

export interface Agent {
    id: string;
    name: string;
    capabilities: string[];
    state: 'idle' | 'busy' | 'blocked' | 'offline';
    config: Record<string, unknown>;
    lastSeen: number;
    metadata?: Record<string, unknown>;
}

export interface Memory {
    id: string;
    type: string;
    content: Record<string, unknown>;
    agentId: string;
    taskId: string;
    tags?: string[];
    priority?: number;
    createdAt: number;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

export const contextos = {
    // Health & Stats
    health: () => request<{ status: string; timestamp: number }>('/health'),
    stats: async (): Promise<Stats> => {
        try {
            return await request<Stats>('/stats');
        } catch {
            // Return mock stats for Vercel deployment where full backend isn't available
            return {
                memory: { totalEntries: 0, byType: {}, cacheSize: 0, cacheHitRate: 0 },
                kernel: { state: 'idle', tasksByStatus: { pending: 0, running: 0, completed: 0, failed: 0 }, queueLength: 0 },
                registry: { total: 1, byState: { idle: 1 } },
                bus: { totalMessages: 0, pendingMessages: 0, subscriptions: 0 },
                gemini: null,
            };
        }
    },

    // Kernel
    getKernelState: () => request<{ state: string }>('/kernel/state'),
    transition: (event: string) =>
        request<{ state: string }>('/kernel/transition', {
            method: 'POST',
            body: JSON.stringify({ event }),
        }),

    // Tasks
    getTasks: () => request<Task[]>('/tasks'),
    getTask: (taskId: string) => request<Task>(`/tasks/${taskId}`),
    executeTask: (name: string, input?: unknown, options?: { description?: string; agentId?: string }) =>
        request<Task>('/execute', {
            method: 'POST',
            body: JSON.stringify({ name, input, ...options }),
        }),
    completeTask: (taskId: string, output?: unknown) =>
        request<Task>(`/execute/${taskId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ output }),
        }),

    // Memory
    createMemory: (data: {
        type: 'fact' | 'decision' | 'observation' | 'artifact' | 'context';
        content: Record<string, unknown>;
        agentId: string;
        taskId: string;
        tags?: string[];
        priority?: number;
        ttl?: number;
        generateEmbedding?: boolean;
    }) =>
        request<Memory>('/memory', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getMemories: (options?: {
        query?: string;
        agentId?: string;
        taskId?: string;
        tags?: string[];
        limit?: number;
    }) => {
        const params = new URLSearchParams();
        if (options?.query) params.set('query', options.query);
        if (options?.agentId) params.set('agentId', options.agentId);
        if (options?.taskId) params.set('taskId', options.taskId);
        if (options?.tags) params.set('tags', options.tags.join(','));
        if (options?.limit) params.set('limit', String(options.limit));
        const query = params.toString();
        return request<Memory[]>(`/memory${query ? `?${query}` : ''}`);
    },

    // Agents
    getAgents: () => request<Agent[]>('/agents'),
    getAgent: (agentId: string) => request<Agent>(`/agents/${agentId}`),
    registerAgent: (name: string, capabilities: string[], config?: Record<string, unknown>) =>
        request<Agent>('/agents', {
            method: 'POST',
            body: JSON.stringify({ name, capabilities, config }),
        }),
};

export default contextos;
