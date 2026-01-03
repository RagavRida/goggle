/**
 * Constraint Memory for Dev Teammate
 * 
 * Stores and recalls user constraints using ContextOS memory.
 * Examples: "Don't touch legacy_login.ts", "Always use TypeScript strict mode"
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type ConstraintType = 'file_protect' | 'require' | 'forbid' | 'preference';

export interface Constraint {
    id: string;
    type: ConstraintType;
    scope: string;          // "auth", "database", "*" (global)
    rule: string;           // Human-readable rule
    pattern?: RegExp;       // Optional pattern for matching
    source: 'user' | 'learned';
    priority: number;       // 1-10, higher = more important
    createdAt: number;
    expiresAt?: number;
}

export interface ConstraintMatch {
    constraint: Constraint;
    relevance: number;
}

// ============================================================================
// Constraint Memory
// ============================================================================

export class ConstraintMemory {
    private constraints: Map<string, Constraint> = new Map();
    private scopeIndex: Map<string, Set<string>> = new Map();

    constructor() {
        // Initialize global scope
        this.scopeIndex.set('*', new Set());
    }

    /**
     * Store a new constraint
     */
    store(
        type: ConstraintType,
        rule: string,
        scope: string = '*',
        options: Partial<Pick<Constraint, 'pattern' | 'source' | 'priority' | 'expiresAt'>> = {}
    ): Constraint {
        const constraint: Constraint = {
            id: uuidv4(),
            type,
            scope,
            rule,
            pattern: options.pattern,
            source: options.source ?? 'user',
            priority: options.priority ?? 5,
            createdAt: Date.now(),
            expiresAt: options.expiresAt,
        };

        this.constraints.set(constraint.id, constraint);

        // Index by scope
        if (!this.scopeIndex.has(scope)) {
            this.scopeIndex.set(scope, new Set());
        }
        this.scopeIndex.get(scope)!.add(constraint.id);

        console.log(`📌 Stored constraint: "${rule}" (scope: ${scope})`);
        return constraint;
    }

    /**
     * Recall constraints relevant to a scope
     */
    recall(scope: string): Constraint[] {
        const now = Date.now();
        const results: Constraint[] = [];

        // Get constraints for specific scope
        const scopeIds = this.scopeIndex.get(scope) ?? new Set();

        // Also get global constraints
        const globalIds = this.scopeIndex.get('*') ?? new Set();

        const allIds = new Set([...scopeIds, ...globalIds]);

        for (const id of allIds) {
            const constraint = this.constraints.get(id);
            if (constraint) {
                // Check expiration
                if (constraint.expiresAt && constraint.expiresAt < now) {
                    continue;
                }
                results.push(constraint);
            }
        }

        // Sort by priority (highest first)
        results.sort((a, b) => b.priority - a.priority);

        console.log(`🔍 Recalled ${results.length} constraints for scope: ${scope}`);
        return results;
    }

    /**
     * Check if a plan violates any constraints
     */
    checkViolations(plan: { files: string[]; actions: string[] }, scope: string): ConstraintMatch[] {
        const constraints = this.recall(scope);
        const violations: ConstraintMatch[] = [];

        for (const constraint of constraints) {
            let violated = false;
            let relevance = 0;

            switch (constraint.type) {
                case 'file_protect':
                    // Check if any file matches protected pattern
                    for (const file of plan.files) {
                        if (constraint.pattern?.test(file) || constraint.rule.includes(file)) {
                            violated = true;
                            relevance = 1.0;
                            break;
                        }
                    }
                    break;

                case 'forbid':
                    // Check if any action is forbidden
                    for (const action of plan.actions) {
                        if (constraint.pattern?.test(action) || action.includes(constraint.rule)) {
                            violated = true;
                            relevance = 0.9;
                            break;
                        }
                    }
                    break;

                case 'require':
                    // Check if required action is missing
                    const hasRequired = plan.actions.some(a =>
                        constraint.pattern?.test(a) || a.includes(constraint.rule)
                    );
                    if (!hasRequired) {
                        violated = true;
                        relevance = 0.8;
                    }
                    break;
            }

            if (violated) {
                violations.push({ constraint, relevance });
            }
        }

        return violations;
    }

    /**
     * Get all constraints (for debugging)
     */
    getAll(): Constraint[] {
        return Array.from(this.constraints.values());
    }

    /**
     * Remove a constraint
     */
    remove(id: string): boolean {
        const constraint = this.constraints.get(id);
        if (constraint) {
            this.constraints.delete(id);
            this.scopeIndex.get(constraint.scope)?.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Clear all constraints
     */
    clear(): void {
        this.constraints.clear();
        this.scopeIndex.clear();
        this.scopeIndex.set('*', new Set());
    }

    /**
     * Format constraints for LLM context
     */
    formatForContext(scope: string): string {
        const constraints = this.recall(scope);
        if (constraints.length === 0) {
            return '<constraints>\nNo constraints recorded.\n</constraints>';
        }

        const lines = constraints.map(c =>
            `  <rule type="${c.type}" priority="${c.priority}">${c.rule}</rule>`
        );

        return `<constraints>\n${lines.join('\n')}\n</constraints>`;
    }
}

// Export singleton for easy access
export const constraintMemory = new ConstraintMemory();
