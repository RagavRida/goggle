/**
 * Task Scheduler
 * 
 * Priority queue and execution management for tasks.
 */

import { Result, ok, err } from '../types/index.js';

export interface ScheduledTask<T = unknown> {
    id: string;
    priority: number;
    data: T;
    scheduledAt: number;
    executeAfter?: number;
    retryCount: number;
    maxRetries: number;
    timeout: number;
}

export interface SchedulerConfig {
    maxConcurrent?: number;
    defaultTimeout?: number;
    defaultMaxRetries?: number;
    retryDelayMs?: number;
    onTaskStart?: (task: ScheduledTask) => void;
    onTaskComplete?: (task: ScheduledTask, result: unknown) => void;
    onTaskError?: (task: ScheduledTask, error: Error) => void;
}

type TaskExecutor<T> = (task: ScheduledTask<T>) => Promise<unknown>;

export class TaskScheduler<T = unknown> {
    private queue: ScheduledTask<T>[] = [];
    private running: Map<string, ScheduledTask<T>> = new Map();
    private executors: Map<string, TaskExecutor<T>> = new Map();
    private maxConcurrent: number;
    private defaultTimeout: number;
    private defaultMaxRetries: number;
    private retryDelay: number;
    private onTaskStart?: (task: ScheduledTask<T>) => void;
    private onTaskComplete?: (task: ScheduledTask<T>, result: unknown) => void;
    private onTaskError?: (task: ScheduledTask<T>, error: Error) => void;
    private processing = false;

    constructor(config: SchedulerConfig = {}) {
        this.maxConcurrent = config.maxConcurrent ?? 5;
        this.defaultTimeout = config.defaultTimeout ?? 30000;
        this.defaultMaxRetries = config.defaultMaxRetries ?? 3;
        this.retryDelay = config.retryDelayMs ?? 1000;
        this.onTaskStart = config.onTaskStart as (task: ScheduledTask<T>) => void;
        this.onTaskComplete = config.onTaskComplete as (task: ScheduledTask<T>, result: unknown) => void;
        this.onTaskError = config.onTaskError as (task: ScheduledTask<T>, error: Error) => void;
    }

    /**
     * Register a task executor
     */
    registerExecutor(name: string, executor: TaskExecutor<T>): void {
        this.executors.set(name, executor);
    }

    /**
     * Schedule a task
     */
    schedule(
        id: string,
        data: T,
        options?: {
            priority?: number;
            executeAfter?: number;
            timeout?: number;
            maxRetries?: number;
        }
    ): ScheduledTask<T> {
        const task: ScheduledTask<T> = {
            id,
            priority: options?.priority ?? 5,
            data,
            scheduledAt: Date.now(),
            executeAfter: options?.executeAfter,
            retryCount: 0,
            maxRetries: options?.maxRetries ?? this.defaultMaxRetries,
            timeout: options?.timeout ?? this.defaultTimeout,
        };

        // Insert maintaining priority order (higher priority first)
        const insertIdx = this.queue.findIndex(t => t.priority < task.priority);
        if (insertIdx === -1) {
            this.queue.push(task);
        } else {
            this.queue.splice(insertIdx, 0, task);
        }

        // Trigger processing
        this.processQueue();

        return task;
    }

    /**
     * Cancel a scheduled or running task
     */
    cancel(taskId: string): boolean {
        // Check queue
        const queueIdx = this.queue.findIndex(t => t.id === taskId);
        if (queueIdx > -1) {
            this.queue.splice(queueIdx, 1);
            return true;
        }

        // Check running
        if (this.running.has(taskId)) {
            this.running.delete(taskId);
            return true;
        }

        return false;
    }

    /**
     * Get queue status
     */
    status(): {
        queued: number;
        running: number;
        maxConcurrent: number;
    } {
        return {
            queued: this.queue.length,
            running: this.running.size,
            maxConcurrent: this.maxConcurrent,
        };
    }

    /**
     * Get all queued tasks
     */
    getQueued(): ScheduledTask<T>[] {
        return [...this.queue];
    }

    /**
     * Get all running tasks
     */
    getRunning(): ScheduledTask<T>[] {
        return Array.from(this.running.values());
    }

    /**
     * Clear all queued tasks
     */
    clear(): void {
        this.queue = [];
    }

    /**
     * Process the queue (called automatically)
     */
    async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        try {
            while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
                const now = Date.now();

                // Find next eligible task
                const eligibleIdx = this.queue.findIndex(
                    t => !t.executeAfter || t.executeAfter <= now
                );

                if (eligibleIdx === -1) break;

                const task = this.queue.splice(eligibleIdx, 1)[0]!;
                this.running.set(task.id, task);

                // Execute asynchronously
                this.executeTask(task);
            }
        } finally {
            this.processing = false;
        }
    }

    // Private methods

    private async executeTask(task: ScheduledTask<T>): Promise<void> {
        this.onTaskStart?.(task);

        try {
            const executor = this.executors.get('default') ?? this.defaultExecutor;

            // Execute with timeout
            const result = await this.withTimeout(
                executor(task),
                task.timeout
            );

            this.running.delete(task.id);
            this.onTaskComplete?.(task, result);
        } catch (error) {
            this.running.delete(task.id);

            const err = error instanceof Error ? error : new Error(String(error));

            // Retry logic
            if (task.retryCount < task.maxRetries) {
                task.retryCount++;
                task.executeAfter = Date.now() + this.retryDelay * task.retryCount;

                // Re-queue with lower priority
                task.priority = Math.max(0, task.priority - 1);
                this.queue.push(task);

                // Trigger processing after delay
                setTimeout(() => this.processQueue(), this.retryDelay * task.retryCount);
            } else {
                this.onTaskError?.(task, err);
            }
        }

        // Continue processing
        this.processQueue();
    }

    private async withTimeout<R>(promise: Promise<R>, ms: number): Promise<R> {
        return Promise.race([
            promise,
            new Promise<R>((_, reject) =>
                setTimeout(() => reject(new Error('Task timeout')), ms)
            ),
        ]);
    }

    private defaultExecutor: TaskExecutor<T> = async (task) => {
        // Default no-op executor
        return task.data;
    };
}

export { DecisionKernel } from './kernel.js';
export type { KernelConfig } from './kernel.js';
export { IntentRouter } from './router.js';
export type { Route, RoutePattern, RouteRequest, RouteMatch } from './router.js';
export { IntentClassifier } from './classifier.js';
export type {
    IntentCategory,
    IntentDefinition,
    IntentSignal,
    ClassificationResult,
    ClassificationRequest,
    ClassifierConfig
} from './classifier.js';
