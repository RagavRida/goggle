/**
 * Intent Router
 * 
 * Rule-based routing for agent requests to appropriate handlers.
 */

import { Result, ok, err } from '../types/index.js';

export interface Route {
    name: string;
    pattern: RoutePattern;
    handler: string; // Handler identifier
    priority?: number;
    metadata?: Record<string, unknown>;
}

export interface RoutePattern {
    intent?: string | RegExp;
    capabilities?: string[];
    tags?: string[];
    custom?: (request: RouteRequest) => boolean;
}

export interface RouteRequest {
    intent: string;
    agentId?: string;
    capabilities?: string[];
    tags?: string[];
    payload?: unknown;
}

export interface RouteMatch {
    route: Route;
    score: number;
    params?: Record<string, string>;
}

export class IntentRouter {
    private routes: Route[] = [];
    private fallbackHandler?: string;

    /**
     * Register a route
     */
    register(route: Route): void {
        this.routes.push(route);
        // Sort by priority (higher first)
        this.routes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    /**
     * Register multiple routes
     */
    registerAll(routes: Route[]): void {
        for (const route of routes) {
            this.register(route);
        }
    }

    /**
     * Unregister a route by name
     */
    unregister(name: string): boolean {
        const idx = this.routes.findIndex(r => r.name === name);
        if (idx > -1) {
            this.routes.splice(idx, 1);
            return true;
        }
        return false;
    }

    /**
     * Set fallback handler
     */
    setFallback(handler: string): void {
        this.fallbackHandler = handler;
    }

    /**
     * Route a request to appropriate handler
     */
    route(request: RouteRequest): Result<RouteMatch> {
        const matches: RouteMatch[] = [];

        for (const route of this.routes) {
            const matchResult = this.matchRoute(route, request);
            if (matchResult.ok && matchResult.value > 0) {
                matches.push({
                    route,
                    score: matchResult.value,
                });
            }
        }

        if (matches.length === 0) {
            if (this.fallbackHandler) {
                return ok({
                    route: {
                        name: '_fallback',
                        pattern: {},
                        handler: this.fallbackHandler,
                    },
                    score: 0,
                });
            }
            return err(new Error(`No route found for intent: ${request.intent}`));
        }

        // Return highest scoring match
        matches.sort((a, b) => b.score - a.score);
        return ok(matches[0]!);
    }

    /**
     * Get all matching routes (for debugging)
     */
    getAllMatches(request: RouteRequest): RouteMatch[] {
        const matches: RouteMatch[] = [];

        for (const route of this.routes) {
            const matchResult = this.matchRoute(route, request);
            if (matchResult.ok && matchResult.value > 0) {
                matches.push({
                    route,
                    score: matchResult.value,
                });
            }
        }

        return matches.sort((a, b) => b.score - a.score);
    }

    /**
     * Check if a request can be routed
     */
    canRoute(request: RouteRequest): boolean {
        const result = this.route(request);
        return result.ok;
    }

    /**
     * Get all registered routes
     */
    getRoutes(): Route[] {
        return [...this.routes];
    }

    // Private methods

    private matchRoute(route: Route, request: RouteRequest): Result<number> {
        try {
            let score = 0;
            let matchCount = 0;
            let totalPatterns = 0;

            const { pattern } = route;

            // Match intent
            if (pattern.intent !== undefined) {
                totalPatterns++;
                if (typeof pattern.intent === 'string') {
                    if (request.intent === pattern.intent) {
                        score += 1;
                        matchCount++;
                    } else if (request.intent.startsWith(pattern.intent)) {
                        score += 0.5;
                        matchCount++;
                    }
                } else if (pattern.intent instanceof RegExp) {
                    if (pattern.intent.test(request.intent)) {
                        score += 1;
                        matchCount++;
                    }
                }
            }

            // Match capabilities
            if (pattern.capabilities && pattern.capabilities.length > 0) {
                totalPatterns++;
                if (request.capabilities) {
                    const matched = pattern.capabilities.filter(
                        c => request.capabilities!.includes(c)
                    );
                    if (matched.length > 0) {
                        score += matched.length / pattern.capabilities.length;
                        matchCount++;
                    }
                }
            }

            // Match tags
            if (pattern.tags && pattern.tags.length > 0) {
                totalPatterns++;
                if (request.tags) {
                    const matched = pattern.tags.filter(t => request.tags!.includes(t));
                    if (matched.length > 0) {
                        score += matched.length / pattern.tags.length;
                        matchCount++;
                    }
                }
            }

            // Custom matcher
            if (pattern.custom) {
                totalPatterns++;
                if (pattern.custom(request)) {
                    score += 1;
                    matchCount++;
                }
            }

            // Require at least one pattern match
            if (totalPatterns > 0 && matchCount === 0) {
                return ok(0);
            }

            // Normalize score
            const normalized = totalPatterns > 0 ? score / totalPatterns : 1;

            // Apply priority boost
            const priority = route.priority ?? 0;
            const finalScore = normalized + (priority / 100);

            return ok(finalScore);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
