/**
 * ContextOS Event Emitter
 * 
 * Real-time event broadcasting for Neural Dashboard integration.
 * Emits events for: memory_gating, context_retrieved, reasoning_start, etc.
 * 
 * WebSocket-ready interface for frontend connection.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Event Types
// ============================================================================

export type ContextOSEventType =
    | 'memory_gating'
    | 'context_retrieved'
    | 'reasoning_start'
    | 'reasoning_complete'
    | 'constraint_loaded'
    | 'constraint_violation'
    | 'execution_start'
    | 'execution_complete'
    | 'test_start'
    | 'test_pass'
    | 'test_fail'
    | 'self_correction'
    | 'agent_registered'
    | 'task_created'
    | 'task_completed';

export interface ContextOSEvent {
    type: ContextOSEventType;
    timestamp: number;
    data: Record<string, unknown>;
    metadata?: {
        agentId?: string;
        taskId?: string;
        scope?: string;
    };
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface MemoryGatingEvent {
    input: string;
    entropy: number;
    similarity: number;
    gateStatus: 'open' | 'closed';
}

export interface ContextRetrievedEvent {
    query: string;
    results: Array<{
        content: string;
        confidence: number;
        source?: string;
    }>;
    tokenCount: number;
}

export interface ReasoningEvent {
    prompt: string;
    model: string;
    phase: 'start' | 'complete';
    duration?: number;
    response?: string;
}

export interface ConstraintEvent {
    constraint: {
        type: string;
        rule: string;
        scope: string;
    };
    action: 'loaded' | 'violated' | 'respected';
}

export interface ExecutionEvent {
    file: string;
    action: 'create' | 'modify' | 'delete';
    linesChanged?: number;
}

export interface TestEvent {
    passed: boolean;
    total: number;
    failed: number;
    errors?: string[];
}

// ============================================================================
// Event Bus
// ============================================================================

export class ContextOSEventBus extends EventEmitter {
    private eventLog: ContextOSEvent[] = [];
    private maxLogSize = 1000;
    private wsClients: Set<{ send: (data: string) => void }> = new Set();

    constructor() {
        super();
        this.setMaxListeners(100);
    }

    /**
     * Emit a typed event
     */
    emit(type: ContextOSEventType, data: object = {}): boolean {
        const event: ContextOSEvent = {
            type,
            timestamp: Date.now(),
            data: data as Record<string, unknown>,
        };

        // Log event
        this.eventLog.push(event);
        if (this.eventLog.length > this.maxLogSize) {
            this.eventLog.shift();
        }

        // Console output with emoji
        const emoji = this.getEmoji(type);
        console.log(`${emoji} [EVENT] ${type}`, JSON.stringify(data).slice(0, 100));

        // Broadcast to WebSocket clients
        this.broadcast(event);

        return super.emit(type, event);
    }

    /**
     * Register a WebSocket client for broadcasts
     */
    registerClient(client: { send: (data: string) => void }): void {
        this.wsClients.add(client);
    }

    /**
     * Remove a WebSocket client
     */
    unregisterClient(client: { send: (data: string) => void }): void {
        this.wsClients.delete(client);
    }

    /**
     * Broadcast event to all WebSocket clients
     */
    private broadcast(event: ContextOSEvent): void {
        const message = JSON.stringify(event);
        for (const client of this.wsClients) {
            try {
                client.send(message);
            } catch {
                this.wsClients.delete(client);
            }
        }
    }

    /**
     * Get event log (for replay/debugging)
     */
    getEventLog(limit = 100): ContextOSEvent[] {
        return this.eventLog.slice(-limit);
    }

    /**
     * Clear event log
     */
    clearLog(): void {
        this.eventLog = [];
    }

    // Helper methods for common events

    memoryGating(data: MemoryGatingEvent): void {
        this.emit('memory_gating', data);
    }

    contextRetrieved(data: ContextRetrievedEvent): void {
        this.emit('context_retrieved', data);
    }

    reasoningStart(data: Partial<ReasoningEvent>): void {
        this.emit('reasoning_start', { ...data, phase: 'start' });
    }

    reasoningComplete(data: Partial<ReasoningEvent>): void {
        this.emit('reasoning_complete', { ...data, phase: 'complete' });
    }

    constraintLoaded(data: ConstraintEvent): void {
        this.emit('constraint_loaded', data);
    }

    constraintViolation(data: ConstraintEvent): void {
        this.emit('constraint_violation', data);
    }

    testResult(data: TestEvent): void {
        this.emit(data.passed ? 'test_pass' : 'test_fail', data);
    }

    selfCorrection(reason: string, attempt: number): void {
        this.emit('self_correction', { reason, attempt });
    }

    private getEmoji(type: ContextOSEventType): string {
        const emojis: Record<ContextOSEventType, string> = {
            memory_gating: '🚪',
            context_retrieved: '📦',
            reasoning_start: '🧠',
            reasoning_complete: '💡',
            constraint_loaded: '📌',
            constraint_violation: '⚠️',
            execution_start: '⚡',
            execution_complete: '✅',
            test_start: '🧪',
            test_pass: '✅',
            test_fail: '❌',
            self_correction: '🔄',
            agent_registered: '🤖',
            task_created: '📋',
            task_completed: '🏁',
        };
        return emojis[type] || '📣';
    }
}

// Export singleton
export const eventBus = new ContextOSEventBus();
