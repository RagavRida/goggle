/**
 * Decision Kernel
 * 
 * State machine-based coordination for agent execution.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    KernelState,
    Task,
    TaskStatus,
    Event,
    EventType,
    Result,
    ok,
    err
} from '../types/index.js';

export interface KernelConfig {
    maxConcurrentTasks?: number;
    taskTimeout?: number; // ms
    onStateChange?: (from: KernelState, to: KernelState) => void;
    onEvent?: (event: Event) => void;
}

interface TaskInternal extends Task {
    timeoutId?: ReturnType<typeof setTimeout>;
}

type StateTransition = {
    from: KernelState;
    to: KernelState;
    event: string;
    guard?: () => boolean;
    action?: () => void;
};

export class DecisionKernel {
    private state: KernelState = 'idle';
    private tasks: Map<string, TaskInternal> = new Map();
    private taskQueue: string[] = [];
    private maxConcurrent: number;
    private taskTimeout: number;
    private onStateChange?: (from: KernelState, to: KernelState) => void;
    private onEvent?: (event: Event) => void;

    // State machine transitions
    private readonly transitions: StateTransition[] = [
        { from: 'idle', to: 'planning', event: 'task_received' },
        { from: 'planning', to: 'executing', event: 'plan_approved' },
        { from: 'planning', to: 'idle', event: 'plan_rejected' },
        { from: 'executing', to: 'verifying', event: 'execution_complete' },
        { from: 'executing', to: 'blocked', event: 'needs_input' },
        { from: 'executing', to: 'error', event: 'execution_failed' },
        { from: 'verifying', to: 'idle', event: 'verified' },
        { from: 'verifying', to: 'executing', event: 'retry' },
        { from: 'verifying', to: 'error', event: 'verification_failed' },
        { from: 'blocked', to: 'executing', event: 'input_received' },
        { from: 'blocked', to: 'idle', event: 'cancelled' },
        { from: 'error', to: 'idle', event: 'reset' },
    ];

    constructor(config: KernelConfig = {}) {
        this.maxConcurrent = config.maxConcurrentTasks ?? 5;
        this.taskTimeout = config.taskTimeout ?? 30000;
        this.onStateChange = config.onStateChange;
        this.onEvent = config.onEvent;
    }

    /**
     * Get current kernel state
     */
    getState(): KernelState {
        return this.state;
    }

    /**
     * Transition to a new state via event
     */
    transition(event: string): Result<KernelState> {
        const transition = this.transitions.find(
            t => t.from === this.state && t.event === event
        );

        if (!transition) {
            return err(new Error(
                `Invalid transition: ${event} from state ${this.state}`
            ));
        }

        if (transition.guard && !transition.guard()) {
            return err(new Error(
                `Transition guard failed: ${event} from ${this.state}`
            ));
        }

        const fromState = this.state;
        this.state = transition.to;

        transition.action?.();
        this.onStateChange?.(fromState, this.state);
        this.emitEvent('kernel:state_changed', { from: fromState, to: this.state });

        return ok(this.state);
    }

    /**
     * Create a new task
     */
    createTask(
        name: string,
        input: unknown,
        options?: {
            description?: string;
            agentId?: string;
            parentTaskId?: string;
            metadata?: Record<string, unknown>;
        }
    ): Result<Task> {
        try {
            const now = Date.now();
            const task: TaskInternal = {
                id: uuidv4(),
                name,
                description: options?.description,
                status: 'pending',
                agentId: options?.agentId,
                parentTaskId: options?.parentTaskId,
                input,
                createdAt: now,
                updatedAt: now,
                metadata: options?.metadata,
            };

            this.tasks.set(task.id, task);
            this.taskQueue.push(task.id);

            this.emitEvent('task:created', { taskId: task.id, name });

            // Auto-start if idle
            if (this.state === 'idle') {
                this.transition('task_received');
            }

            return ok(task);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Start executing a task
     */
    startTask(taskId: string): Result<Task> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return err(new Error(`Task not found: ${taskId}`));
        }

        if (task.status !== 'pending') {
            return err(new Error(`Task ${taskId} is not pending: ${task.status}`));
        }

        const runningCount = Array.from(this.tasks.values())
            .filter(t => t.status === 'running').length;

        if (runningCount >= this.maxConcurrent) {
            return err(new Error(`Max concurrent tasks (${this.maxConcurrent}) reached`));
        }

        task.status = 'running';
        task.updatedAt = Date.now();

        // Set timeout
        task.timeoutId = setTimeout(() => {
            this.failTask(taskId, 'Task timeout');
        }, this.taskTimeout);

        this.emitEvent('task:started', { taskId });

        return ok(task);
    }

    /**
     * Complete a task successfully
     */
    completeTask(taskId: string, output: unknown): Result<Task> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return err(new Error(`Task not found: ${taskId}`));
        }

        if (task.status !== 'running') {
            return err(new Error(`Task ${taskId} is not running: ${task.status}`));
        }

        if (task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        const now = Date.now();
        task.status = 'completed';
        task.output = output;
        task.updatedAt = now;
        task.completedAt = now;

        this.emitEvent('task:completed', { taskId, output });

        // Check if all tasks done
        this.checkAllTasksComplete();

        return ok(task);
    }

    /**
     * Fail a task
     */
    failTask(taskId: string, error: string): Result<Task> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return err(new Error(`Task not found: ${taskId}`));
        }

        if (task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        const now = Date.now();
        task.status = 'failed';
        task.error = error;
        task.updatedAt = now;
        task.completedAt = now;

        this.emitEvent('task:failed', { taskId, error });

        // Transition to error state
        this.transition('execution_failed');

        return ok(task);
    }

    /**
     * Cancel a task
     */
    cancelTask(taskId: string): Result<Task> {
        const task = this.tasks.get(taskId);
        if (!task) {
            return err(new Error(`Task not found: ${taskId}`));
        }

        if (task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        task.status = 'cancelled';
        task.updatedAt = Date.now();

        // Remove from queue
        const queueIdx = this.taskQueue.indexOf(taskId);
        if (queueIdx > -1) {
            this.taskQueue.splice(queueIdx, 1);
        }

        return ok(task);
    }

    /**
     * Get a task by ID
     */
    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * Get all tasks
     */
    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    /**
     * Get tasks by status
     */
    getTasksByStatus(status: TaskStatus): Task[] {
        return Array.from(this.tasks.values()).filter(t => t.status === status);
    }

    /**
     * Get next pending task
     */
    getNextPendingTask(): Task | undefined {
        for (const taskId of this.taskQueue) {
            const task = this.tasks.get(taskId);
            if (task?.status === 'pending') {
                return task;
            }
        }
        return undefined;
    }

    /**
     * Process pending tasks
     */
    processPendingTasks(): Result<Task[]> {
        const started: Task[] = [];

        while (true) {
            const runningCount = Array.from(this.tasks.values())
                .filter(t => t.status === 'running').length;

            if (runningCount >= this.maxConcurrent) break;

            const next = this.getNextPendingTask();
            if (!next) break;

            const result = this.startTask(next.id);
            if (result.ok) {
                started.push(result.value);
            }
        }

        return ok(started);
    }

    /**
     * Get kernel statistics
     */
    stats(): {
        state: KernelState;
        tasksByStatus: Record<TaskStatus, number>;
        queueLength: number;
    } {
        const tasksByStatus: Record<TaskStatus, number> = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };

        for (const task of this.tasks.values()) {
            tasksByStatus[task.status]++;
        }

        return {
            state: this.state,
            tasksByStatus,
            queueLength: this.taskQueue.length,
        };
    }

    /**
     * Reset kernel state
     */
    reset(): void {
        // Cancel all running tasks
        for (const task of this.tasks.values()) {
            if (task.status === 'running' && task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
        }

        this.tasks.clear();
        this.taskQueue = [];
        this.state = 'idle';
    }

    // Private methods

    private checkAllTasksComplete(): void {
        const pending = this.getTasksByStatus('pending');
        const running = this.getTasksByStatus('running');

        if (pending.length === 0 && running.length === 0) {
            if (this.state === 'executing') {
                this.transition('execution_complete');
            }
        }
    }

    private emitEvent(type: EventType, payload: unknown): void {
        const event: Event = {
            type,
            timestamp: Date.now(),
            payload,
            source: 'kernel',
        };
        this.onEvent?.(event);
    }
}
