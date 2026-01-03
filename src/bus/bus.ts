/**
 * Message Bus
 * 
 * Structured inter-agent communication with pub/sub and request/response patterns.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageType, Result, ok, err } from '../types/index.js';

export interface BusConfig {
    db: Database.Database;
    retentionMs?: number; // How long to keep messages
}

type MessageHandler<T = unknown> = (message: Message<T>) => void | Promise<void>;
type TopicFilter = string | RegExp;

interface Subscription {
    id: string;
    filter: TopicFilter;
    handler: MessageHandler;
}

export class MessageBus {
    private db: Database.Database;
    private subscriptions: Map<string, Subscription[]> = new Map(); // topic -> subscriptions
    private wildcardSubscriptions: Subscription[] = [];
    private retentionMs: number;

    private stmtInsert: Database.Statement;
    private stmtMarkProcessed: Database.Statement;
    private stmtGetPending: Database.Statement;
    private stmtGetByCorrelation: Database.Statement;
    private stmtPurgeOld: Database.Statement;

    constructor(config: BusConfig) {
        this.db = config.db;
        this.retentionMs = config.retentionMs ?? 86400000; // 24 hours

        this.stmtInsert = this.db.prepare(`
      INSERT INTO messages (id, type, from_agent, to_agent, payload, timestamp, reply_to, correlation_id, ttl)
      VALUES (@id, @type, @from, @to, @payload, @timestamp, @replyTo, @correlationId, @ttl)
    `);

        this.stmtMarkProcessed = this.db.prepare('UPDATE messages SET processed = 1 WHERE id = ?');

        this.stmtGetPending = this.db.prepare(`
      SELECT * FROM messages 
      WHERE to_agent = ? AND processed = 0 
      ORDER BY timestamp ASC
    `);

        this.stmtGetByCorrelation = this.db.prepare(`
      SELECT * FROM messages WHERE correlation_id = ? ORDER BY timestamp ASC
    `);

        this.stmtPurgeOld = this.db.prepare(`
      DELETE FROM messages WHERE timestamp < ?
    `);
    }

    /**
     * Publish a message
     */
    publish<T>(
        type: MessageType,
        from: string,
        to: string,
        payload: T,
        options?: {
            replyTo?: string;
            correlationId?: string;
            ttl?: number;
        }
    ): Result<Message<T>> {
        try {
            const message: Message<T> = {
                id: uuidv4(),
                type,
                from,
                to,
                payload,
                timestamp: Date.now(),
                replyTo: options?.replyTo,
                correlationId: options?.correlationId ?? uuidv4(),
                ttl: options?.ttl,
            };

            // Persist message
            this.stmtInsert.run({
                id: message.id,
                type: message.type,
                from: message.from,
                to: message.to,
                payload: JSON.stringify(message.payload),
                timestamp: message.timestamp,
                replyTo: message.replyTo ?? null,
                correlationId: message.correlationId ?? null,
                ttl: message.ttl ?? null,
            });

            // Deliver to subscribers
            this.deliverToSubscribers(message);

            return ok(message);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Send a request and wait for response
     */
    async request<TReq, TRes>(
        from: string,
        to: string,
        payload: TReq,
        timeoutMs?: number
    ): Promise<Result<Message<TRes>>> {
        const correlationId = uuidv4();
        const timeout = timeoutMs ?? 30000;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.unsubscribe(subId);
                resolve(err(new Error('Request timeout')));
            }, timeout);

            const subId = this.subscribe<TRes>(to, (response) => {
                if (response.correlationId === correlationId && response.type === 'response') {
                    clearTimeout(timer);
                    this.unsubscribe(subId);
                    resolve(ok(response));
                }
            });

            // Send request
            this.publish('request', from, to, payload, { correlationId });
        });
    }

    /**
     * Reply to a message
     */
    reply<T>(original: Message, payload: T): Result<Message<T>> {
        return this.publish('response', original.to, original.from, payload, {
            replyTo: original.id,
            correlationId: original.correlationId,
        });
    }

    /**
     * Subscribe to messages
     */
    subscribe<T = unknown>(filter: TopicFilter, handler: MessageHandler<T>): string {
        const id = uuidv4();
        const subscription: Subscription = {
            id,
            filter,
            handler: handler as MessageHandler,
        };

        if (filter === '*') {
            this.wildcardSubscriptions.push(subscription);
        } else if (typeof filter === 'string') {
            const existing = this.subscriptions.get(filter) ?? [];
            existing.push(subscription);
            this.subscriptions.set(filter, existing);
        } else {
            // RegExp filters go to wildcard for simplicity
            this.wildcardSubscriptions.push(subscription);
        }

        return id;
    }

    /**
     * Unsubscribe from messages
     */
    unsubscribe(subscriptionId: string): boolean {
        // Check topic subscriptions
        for (const [topic, subs] of this.subscriptions.entries()) {
            const idx = subs.findIndex(s => s.id === subscriptionId);
            if (idx > -1) {
                subs.splice(idx, 1);
                if (subs.length === 0) {
                    this.subscriptions.delete(topic);
                }
                return true;
            }
        }

        // Check wildcard subscriptions
        const wildcardIdx = this.wildcardSubscriptions.findIndex(s => s.id === subscriptionId);
        if (wildcardIdx > -1) {
            this.wildcardSubscriptions.splice(wildcardIdx, 1);
            return true;
        }

        return false;
    }

    /**
     * Get pending messages for an agent
     */
    getPending(agentId: string): Result<Message[]> {
        try {
            const rows = this.stmtGetPending.all(agentId) as Record<string, unknown>[];
            return ok(rows.map(row => this.deserializeMessage(row)));
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Mark message as processed
     */
    markProcessed(messageId: string): Result<boolean> {
        try {
            const result = this.stmtMarkProcessed.run(messageId);
            return ok(result.changes > 0);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get message thread by correlation ID
     */
    getThread(correlationId: string): Result<Message[]> {
        try {
            const rows = this.stmtGetByCorrelation.all(correlationId) as Record<string, unknown>[];
            return ok(rows.map(row => this.deserializeMessage(row)));
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Broadcast to all agents
     */
    broadcast<T>(from: string, payload: T, type?: MessageType): Result<Message<T>> {
        return this.publish(type ?? 'event', from, '*', payload);
    }

    /**
     * Purge old messages
     */
    purgeOld(): Result<number> {
        try {
            const cutoff = Date.now() - this.retentionMs;
            const result = this.stmtPurgeOld.run(cutoff);
            return ok(result.changes);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get bus statistics
     */
    stats(): Result<{
        totalMessages: number;
        pendingMessages: number;
        subscriptions: number;
    }> {
        try {
            const total = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
            const pending = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE processed = 0').get() as { count: number };

            let subCount = this.wildcardSubscriptions.length;
            for (const subs of this.subscriptions.values()) {
                subCount += subs.length;
            }

            return ok({
                totalMessages: total.count,
                pendingMessages: pending.count,
                subscriptions: subCount,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    // Private methods

    private deliverToSubscribers(message: Message): void {
        const target = message.to;

        // Direct subscriptions
        const directSubs = this.subscriptions.get(target) ?? [];
        for (const sub of directSubs) {
            this.safeDeliver(sub, message);
        }

        // Broadcast to wildcard if target is '*'
        if (target === '*') {
            for (const subs of this.subscriptions.values()) {
                for (const sub of subs) {
                    this.safeDeliver(sub, message);
                }
            }
        }

        // Wildcard and regex subscriptions
        for (const sub of this.wildcardSubscriptions) {
            if (sub.filter === '*') {
                this.safeDeliver(sub, message);
            } else if (sub.filter instanceof RegExp && sub.filter.test(target)) {
                this.safeDeliver(sub, message);
            }
        }
    }

    private safeDeliver(sub: Subscription, message: Message): void {
        try {
            const result = sub.handler(message);
            if (result instanceof Promise) {
                result.catch(() => {
                    // Log error but don't throw
                });
            }
        } catch {
            // Swallow handler errors
        }
    }

    private deserializeMessage(row: Record<string, unknown>): Message {
        return {
            id: row['id'] as string,
            type: row['type'] as MessageType,
            from: row['from_agent'] as string,
            to: row['to_agent'] as string,
            payload: JSON.parse(row['payload'] as string),
            timestamp: row['timestamp'] as number,
            replyTo: row['reply_to'] as string | undefined,
            correlationId: row['correlation_id'] as string | undefined,
            ttl: row['ttl'] as number | undefined,
        };
    }
}
