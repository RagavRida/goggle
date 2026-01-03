/**
 * Intent Classifier for ContextOS
 * 
 * Latency-first classification of user input into execution paths.
 * Target: < 10ms classification time.
 * 
 * INTENT CATEGORIES:
 * - fast_path: No memory, no agents (immediate response)
 * - factual: Single Gemini call (stateless Q&A)
 * - workflow: Multi-agent + shared memory (complex tasks)
 * - high_risk: Guarded execution (destructive operations)
 */

import { Result, ok, err } from '../types/index.js';

// ============================================================================
// Intent Definitions
// ============================================================================

export type IntentCategory = 'fast_path' | 'factual' | 'workflow' | 'high_risk';

export interface IntentSignal {
    keywords: string[];
    patterns: RegExp[];
    weight: number;
}

export interface IntentDefinition {
    category: IntentCategory;
    description: string;
    signals: IntentSignal;
    examples: string[];
    executionPath: {
        requiresMemory: boolean;
        requiresAgents: boolean;
        requiresGuard: boolean;
        maxLatencyMs: number;
    };
}

export interface ClassificationResult {
    intent: IntentCategory;
    confidence: number;
    scores: Record<IntentCategory, number>;
    signals: string[];
    latencyMs: number;
    explanation: string;
}

export interface ClassificationRequest {
    input: string;
    context?: {
        previousIntent?: IntentCategory;
        agentId?: string;
        hasActiveWorkflow?: boolean;
    };
}

// ============================================================================
// Intent Definitions (Static Configuration)
// ============================================================================

const INTENT_DEFINITIONS: Record<IntentCategory, IntentDefinition> = {
    fast_path: {
        category: 'fast_path',
        description: 'Immediate response without memory or agent involvement',
        signals: {
            keywords: [
                'hello', 'hi', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'got it',
                'yes', 'no', 'sure', 'bye', 'goodbye', 'help', 'what can you do',
                'who are you', 'ping', 'status', 'version', 'time', 'date'
            ],
            patterns: [
                /^(hi|hello|hey)[\s!.,]*$/i,
                /^(thanks|thank you|thx)[\s!.,]*$/i,
                /^(ok|okay|yes|no|sure)[\s!.,]*$/i,
                /^what('s| is) (the )?(time|date)/i,
                /^(ping|status|version)$/i,
            ],
            weight: 1.0,
        },
        examples: [
            'Hello!',
            'Thanks',
            'What time is it?',
            'ping',
        ],
        executionPath: {
            requiresMemory: false,
            requiresAgents: false,
            requiresGuard: false,
            maxLatencyMs: 10,
        },
    },

    factual: {
        category: 'factual',
        description: 'Single Gemini call for stateless question answering',
        signals: {
            keywords: [
                'what is', 'what are', 'who is', 'who are', 'when did', 'when was',
                'where is', 'where are', 'how do', 'how does', 'why is', 'why does',
                'explain', 'define', 'describe', 'tell me about', 'summarize',
                'translate', 'calculate', 'convert', 'compare', 'list'
            ],
            patterns: [
                /^(what|who|when|where|why|how)\s+/i,
                /^(explain|define|describe|summarize)\s+/i,
                /^(tell me|can you tell)\s+(about|what)/i,
                /^(translate|calculate|convert)\s+/i,
                /\?$/,
            ],
            weight: 0.8,
        },
        examples: [
            'What is TypeScript?',
            'Explain the concept of closures',
            'Translate "hello" to Spanish',
            'How does TCP/IP work?',
        ],
        executionPath: {
            requiresMemory: false,
            requiresAgents: false,
            requiresGuard: false,
            maxLatencyMs: 2000,
        },
    },

    workflow: {
        category: 'workflow',
        description: 'Multi-step task requiring agents and shared memory',
        signals: {
            keywords: [
                'create', 'build', 'implement', 'develop', 'design', 'refactor',
                'analyze', 'test', 'debug', 'fix', 'update', 'modify', 'change',
                'add', 'remove', 'migrate', 'deploy', 'setup', 'configure',
                'write code', 'generate', 'project', 'application', 'system',
                'remember', 'recall', 'based on', 'previous', 'earlier', 'context'
            ],
            patterns: [
                /^(create|build|implement|develop)\s+/i,
                /^(analyze|test|debug|fix)\s+/i,
                /^(add|remove|update|modify)\s+/i,
                /\b(file|folder|directory|code|function|class|component)\b/i,
                /\b(step\s*\d|phase\s*\d|then|after that|next)\b/i,
                /\b(remember|recall|context|previous|earlier)\b/i,
            ],
            weight: 0.9,
        },
        examples: [
            'Create a REST API for user management',
            'Refactor this function to use async/await',
            'Based on our earlier discussion, implement the auth module',
            'Debug the login flow and fix the issue',
        ],
        executionPath: {
            requiresMemory: true,
            requiresAgents: true,
            requiresGuard: false,
            maxLatencyMs: 30000,
        },
    },

    high_risk: {
        category: 'high_risk',
        description: 'Destructive or irreversible operations requiring confirmation',
        signals: {
            keywords: [
                'delete', 'remove all', 'drop', 'truncate', 'destroy', 'wipe',
                'reset', 'clear all', 'force', 'override', 'bypass', 'sudo',
                'production', 'prod', 'live', 'database', 'credentials', 'secret',
                'api key', 'password', 'token', 'deploy to prod', 'push to main',
                'rm -rf', 'format', 'erase'
            ],
            patterns: [
                /\b(delete|remove|drop|destroy|wipe)\s+(all|everything|database)/i,
                /\brm\s+(-rf?|--force)/i,
                /\b(production|prod)\b.*\b(deploy|push|update)/i,
                /\b(deploy|push)\b.*\b(production|prod|main|master)/i,
                /\b(api[_\s]?key|password|secret|token|credential)/i,
                /\b(force|override|bypass)\s+(push|deploy|merge)/i,
            ],
            weight: 1.0,
        },
        examples: [
            'Delete all user data from production',
            'Deploy to prod immediately',
            'rm -rf node_modules',
            'Reset the database',
        ],
        executionPath: {
            requiresMemory: true,
            requiresAgents: true,
            requiresGuard: true,
            maxLatencyMs: 60000,
        },
    },
};

// ============================================================================
// Intent Classifier
// ============================================================================

export interface ClassifierConfig {
    /** Minimum confidence threshold (0-1) */
    confidenceThreshold?: number;
    /** Enable detailed signal tracking */
    explainability?: boolean;
    /** Custom signal boosters */
    customSignals?: Partial<Record<IntentCategory, IntentSignal>>;
}

export class IntentClassifier {
    private definitions: Record<IntentCategory, IntentDefinition>;
    private confidenceThreshold: number;
    private explainability: boolean;

    // Pre-compiled pattern cache for performance
    private keywordSets: Record<IntentCategory, Set<string>>;

    constructor(config: ClassifierConfig = {}) {
        this.definitions = { ...INTENT_DEFINITIONS };
        this.confidenceThreshold = config.confidenceThreshold ?? 0.3;
        this.explainability = config.explainability ?? true;

        // Merge custom signals
        if (config.customSignals) {
            for (const [category, signal] of Object.entries(config.customSignals)) {
                const cat = category as IntentCategory;
                if (this.definitions[cat] && signal) {
                    this.definitions[cat].signals = {
                        keywords: [...this.definitions[cat].signals.keywords, ...signal.keywords],
                        patterns: [...this.definitions[cat].signals.patterns, ...signal.patterns],
                        weight: signal.weight ?? this.definitions[cat].signals.weight,
                    };
                }
            }
        }

        // Pre-build keyword sets for O(1) lookup
        this.keywordSets = {} as Record<IntentCategory, Set<string>>;
        for (const [category, def] of Object.entries(this.definitions)) {
            this.keywordSets[category as IntentCategory] = new Set(
                def.signals.keywords.map(k => k.toLowerCase())
            );
        }
    }

    /**
     * Classify input into an intent category
     * Target: < 10ms latency
     */
    classify(request: ClassificationRequest): Result<ClassificationResult> {
        const startTime = performance.now();

        try {
            const input = request.input.toLowerCase().trim();
            const tokens = this.tokenize(input);
            const matchedSignals: string[] = [];

            // Calculate scores for each category
            const scores: Record<IntentCategory, number> = {
                fast_path: 0,
                factual: 0,
                workflow: 0,
                high_risk: 0,
            };

            // Phase 1: Keyword matching (fastest)
            for (const [category, keywordSet] of Object.entries(this.keywordSets)) {
                const cat = category as IntentCategory;
                for (const token of tokens) {
                    if (keywordSet.has(token)) {
                        scores[cat] += this.definitions[cat].signals.weight;
                        if (this.explainability) {
                            matchedSignals.push(`keyword:${token}→${cat}`);
                        }
                    }
                }
                // Check multi-word keywords
                for (const keyword of this.definitions[cat].signals.keywords) {
                    if (keyword.includes(' ') && input.includes(keyword.toLowerCase())) {
                        scores[cat] += this.definitions[cat].signals.weight * 1.5;
                        if (this.explainability) {
                            matchedSignals.push(`phrase:${keyword}→${cat}`);
                        }
                    }
                }
            }

            // Phase 2: Pattern matching
            for (const [category, def] of Object.entries(this.definitions)) {
                const cat = category as IntentCategory;
                for (const pattern of def.signals.patterns) {
                    if (pattern.test(request.input)) {
                        scores[cat] += def.signals.weight * 1.2;
                        if (this.explainability) {
                            matchedSignals.push(`pattern:${pattern.source.slice(0, 20)}→${cat}`);
                        }
                        break; // One pattern match per category is enough
                    }
                }
            }

            // Phase 3: Context boosting
            if (request.context?.hasActiveWorkflow) {
                scores.workflow += 0.5;
                matchedSignals.push('context:active_workflow→workflow');
            }
            if (request.context?.previousIntent === 'workflow') {
                scores.workflow += 0.3;
                matchedSignals.push('context:previous_workflow→workflow');
            }

            // Phase 4: High-risk safety check (always prioritize if detected)
            if (scores.high_risk > 0) {
                scores.high_risk *= 2; // Double weight for safety
            }

            // Normalize scores to confidence values
            const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
            const normalizedScores = { ...scores };
            if (totalScore > 0) {
                for (const cat of Object.keys(normalizedScores) as IntentCategory[]) {
                    normalizedScores[cat] = scores[cat] / totalScore;
                }
            }

            // Determine winner
            let winner: IntentCategory = 'factual'; // Default fallback
            let maxScore = 0;
            for (const [cat, score] of Object.entries(normalizedScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    winner = cat as IntentCategory;
                }
            }

            // If no strong signal, default to factual
            if (totalScore === 0 || maxScore < this.confidenceThreshold) {
                winner = 'factual';
                normalizedScores.factual = 0.5;
                maxScore = 0.5;
                matchedSignals.push('default:no_signal→factual');
            }

            const latencyMs = performance.now() - startTime;

            // Build explanation
            const def = this.definitions[winner];
            const explanation = this.buildExplanation(winner, matchedSignals, maxScore);

            return ok({
                intent: winner,
                confidence: maxScore,
                scores: normalizedScores,
                signals: matchedSignals,
                latencyMs,
                explanation,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get execution path for an intent
     */
    getExecutionPath(intent: IntentCategory): IntentDefinition['executionPath'] {
        return this.definitions[intent].executionPath;
    }

    /**
     * Get all intent definitions (for debugging)
     */
    getDefinitions(): Record<IntentCategory, IntentDefinition> {
        return { ...this.definitions };
    }

    /**
     * Quick classification (returns just the intent)
     */
    quickClassify(input: string): IntentCategory {
        const result = this.classify({ input });
        return result.ok ? result.value.intent : 'factual';
    }

    // Private methods

    private tokenize(input: string): string[] {
        return input
            .toLowerCase()
            .replace(/[^\w\s-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    private buildExplanation(
        intent: IntentCategory,
        signals: string[],
        confidence: number
    ): string {
        const def = this.definitions[intent];
        const signalSummary = signals.slice(0, 3).join(', ');

        return `Classified as "${intent}" (${(confidence * 100).toFixed(0)}% confidence). ` +
            `${def.description}. ` +
            `Matched: ${signalSummary || 'default pattern'}.`;
    }
}

// ============================================================================
// Routing Logic Pseudocode
// ============================================================================

/*
PSEUDOCODE: Intent Classification Flow

function classify(input, context):
    start_timer()
    
    # Pre-process (< 1ms)
    tokens = tokenize(lowercase(input))
    scores = {fast_path: 0, factual: 0, workflow: 0, high_risk: 0}
    
    # Phase 1: Keyword Match (< 2ms)
    for category in categories:
        for token in tokens:
            if token in keyword_sets[category]:
                scores[category] += weight[category]
    
    # Phase 2: Pattern Match (< 3ms)
    for category in categories:
        for pattern in patterns[category]:
            if pattern.test(input):
                scores[category] += weight[category] * 1.2
                break  # One match is enough
    
    # Phase 3: Context Boost (< 1ms)
    if context.has_active_workflow:
        scores.workflow += 0.5
    if context.previous_intent == workflow:
        scores.workflow += 0.3
    
    # Phase 4: Safety Override (< 1ms)
    if scores.high_risk > 0:
        scores.high_risk *= 2  # Prioritize safety
    
    # Phase 5: Normalize & Decide (< 1ms)
    total = sum(scores)
    if total > 0:
        normalize(scores)
    
    winner = argmax(scores)
    confidence = scores[winner]
    
    if confidence < threshold:
        winner = factual  # Safe default
    
    return {
        intent: winner,
        confidence: confidence,
        latency: elapsed_time()
    }

ROUTING DECISION:
    
    switch (intent):
        case fast_path:
            → return immediate response
            → no memory access
            → no Gemini call
            
        case factual:
            → single Gemini call
            → no memory persistence
            → response caching enabled
            
        case workflow:
            → load context from memory
            → spawn appropriate agents
            → persist decisions to memory
            → multi-turn execution
            
        case high_risk:
            → require user confirmation
            → log to audit trail
            → execute with guards
            → rollback capability
*/

// ============================================================================
// Export
// ============================================================================

export { IntentRouter } from './router.js';
export type { Route, RoutePattern, RouteRequest, RouteMatch } from './router.js';
