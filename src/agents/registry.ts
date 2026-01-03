/**
 * Agent Registry
 * 
 * Manages agent lifecycle, capabilities, and health monitoring.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
    AgentDescriptor,
    AgentState,
    Event,
    EventType,
    Result,
    ok,
    err
} from '../types/index.js';

export interface RegistryConfig {
    db: Database.Database;
    heartbeatInterval?: number; // ms
    offlineThreshold?: number; // ms after last heartbeat to mark offline
    onEvent?: (event: Event) => void;
}

export class AgentRegistry {
    private db: Database.Database;
    private cache: Map<string, AgentDescriptor> = new Map();
    private heartbeatInterval: number;
    private offlineThreshold: number;
    private onEvent?: (event: Event) => void;
    private heartbeatTimer?: ReturnType<typeof setInterval>;

    private stmtInsert: Database.Statement;
    private stmtUpdate: Database.Statement;
    private stmtDelete: Database.Statement;
    private stmtGetById: Database.Statement;
    private stmtGetAll: Database.Statement;
    private stmtUpdateState: Database.Statement;
    private stmtUpdateLastSeen: Database.Statement;

    constructor(config: RegistryConfig) {
        this.db = config.db;
        this.heartbeatInterval = config.heartbeatInterval ?? 5000;
        this.offlineThreshold = config.offlineThreshold ?? 15000;
        this.onEvent = config.onEvent;

        // Prepare statements
        this.stmtInsert = this.db.prepare(`
      INSERT INTO agents (id, name, capabilities, state, config, last_seen, metadata)
      VALUES (@id, @name, @capabilities, @state, @config, @lastSeen, @metadata)
    `);

        this.stmtUpdate = this.db.prepare(`
      UPDATE agents 
      SET name = @name, capabilities = @capabilities, state = @state, 
          config = @config, metadata = @metadata, updated_at = strftime('%s', 'now') * 1000
      WHERE id = @id
    `);

        this.stmtDelete = this.db.prepare('DELETE FROM agents WHERE id = ?');
        this.stmtGetById = this.db.prepare('SELECT * FROM agents WHERE id = ?');
        this.stmtGetAll = this.db.prepare('SELECT * FROM agents');

        this.stmtUpdateState = this.db.prepare(`
      UPDATE agents SET state = ?, updated_at = strftime('%s', 'now') * 1000 WHERE id = ?
    `);

        this.stmtUpdateLastSeen = this.db.prepare(`
      UPDATE agents SET last_seen = ?, updated_at = strftime('%s', 'now') * 1000 WHERE id = ?
    `);

        // Start health monitoring
        this.startHealthMonitor();
    }

    /**
     * Register a new agent
     */
    register(
        name: string,
        capabilities: string[],
        config?: Record<string, unknown>,
        metadata?: Record<string, unknown>
    ): Result<AgentDescriptor> {
        try {
            const now = Date.now();
            const agent: AgentDescriptor = {
                id: uuidv4(),
                name,
                capabilities,
                state: 'idle',
                config: config ?? {},
                lastSeen: now,
                metadata,
            };

            this.stmtInsert.run({
                id: agent.id,
                name: agent.name,
                capabilities: JSON.stringify(agent.capabilities),
                state: agent.state,
                config: JSON.stringify(agent.config),
                lastSeen: agent.lastSeen,
                metadata: agent.metadata ? JSON.stringify(agent.metadata) : null,
            });

            this.cache.set(agent.id, agent);
            this.emitEvent('agent:registered', { agentId: agent.id, name });

            return ok(agent);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Deregister an agent
     */
    deregister(agentId: string): Result<boolean> {
        try {
            const result = this.stmtDelete.run(agentId);
            this.cache.delete(agentId);

            if (result.changes > 0) {
                this.emitEvent('agent:deregistered', { agentId });
            }

            return ok(result.changes > 0);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get an agent by ID
     */
    get(agentId: string): Result<AgentDescriptor | null> {
        try {
            // Check cache
            const cached = this.cache.get(agentId);
            if (cached) return ok(cached);

            const row = this.stmtGetById.get(agentId) as Record<string, unknown> | undefined;
            if (!row) return ok(null);

            const agent = this.deserializeAgent(row);
            this.cache.set(agent.id, agent);

            return ok(agent);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get all registered agents
     */
    getAll(): Result<AgentDescriptor[]> {
        try {
            const rows = this.stmtGetAll.all() as Record<string, unknown>[];
            const agents = rows.map(row => this.deserializeAgent(row));

            // Update cache
            for (const agent of agents) {
                this.cache.set(agent.id, agent);
            }

            return ok(agents);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Update agent state
     */
    setState(agentId: string, state: AgentState): Result<AgentDescriptor | null> {
        try {
            const existing = this.get(agentId);
            if (!existing.ok) return existing;
            if (!existing.value) return ok(null);

            const oldState = existing.value.state;
            this.stmtUpdateState.run(state, agentId);

            const updated = { ...existing.value, state };
            this.cache.set(agentId, updated);

            if (oldState !== state) {
                this.emitEvent('agent:state_changed', {
                    agentId,
                    from: oldState,
                    to: state
                });
            }

            return ok(updated);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Record agent heartbeat
     */
    heartbeat(agentId: string): Result<boolean> {
        try {
            const now = Date.now();
            const result = this.stmtUpdateLastSeen.run(now, agentId);

            if (result.changes > 0) {
                const cached = this.cache.get(agentId);
                if (cached) {
                    cached.lastSeen = now;
                    // If agent was offline, mark as idle
                    if (cached.state === 'offline') {
                        return this.setState(agentId, 'idle').ok
                            ? ok(true)
                            : ok(false);
                    }
                }
            }

            return ok(result.changes > 0);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Find agents by capability
     */
    findByCapability(capability: string): Result<AgentDescriptor[]> {
        try {
            const all = this.getAll();
            if (!all.ok) return all;

            const matching = all.value.filter(
                agent => agent.capabilities.includes(capability) && agent.state !== 'offline'
            );

            return ok(matching);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Find available agents (idle state)
     */
    findAvailable(): Result<AgentDescriptor[]> {
        try {
            const all = this.getAll();
            if (!all.ok) return all;

            return ok(all.value.filter(agent => agent.state === 'idle'));
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get registry statistics
     */
    stats(): Result<{
        total: number;
        byState: Record<AgentState, number>;
    }> {
        try {
            const all = this.getAll();
            if (!all.ok) return all as Result<{ total: number; byState: Record<AgentState, number> }>;

            const byState: Record<AgentState, number> = {
                idle: 0,
                busy: 0,
                blocked: 0,
                offline: 0,
            };

            for (const agent of all.value) {
                byState[agent.state]++;
            }

            return ok({ total: all.value.length, byState });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Stop the registry and clean up
     */
    stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        this.cache.clear();
    }

    // Private methods

    private startHealthMonitor(): void {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();

            for (const [agentId, agent] of this.cache.entries()) {
                if (agent.state !== 'offline' && now - agent.lastSeen > this.offlineThreshold) {
                    this.setState(agentId, 'offline');
                }
            }
        }, this.heartbeatInterval);
    }

    private deserializeAgent(row: Record<string, unknown>): AgentDescriptor {
        return {
            id: row['id'] as string,
            name: row['name'] as string,
            capabilities: JSON.parse(row['capabilities'] as string) as string[],
            state: row['state'] as AgentState,
            config: JSON.parse(row['config'] as string) as Record<string, unknown>,
            lastSeen: row['last_seen'] as number,
            metadata: row['metadata']
                ? JSON.parse(row['metadata'] as string) as Record<string, unknown>
                : undefined,
        };
    }

    private emitEvent(type: EventType, payload: unknown): void {
        const event: Event = {
            type,
            timestamp: Date.now(),
            payload,
            source: 'registry',
        };
        this.onEvent?.(event);
    }
}
