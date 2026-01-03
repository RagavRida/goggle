/**
 * Dev Teammate - Self-Correcting Agent
 * 
 * A GitHub bot that:
 * 1. Reads issues and extracts intent
 * 2. Recalls constraints from memory
 * 3. Plans code changes with Gemini
 * 4. Executes and tests changes
 * 5. Self-corrects on failure (autonomous loop)
 */

import { ConstraintMemory, constraintMemory } from './constraint-memory.js';
import { ReasoningEngine, Issue, RefactorPlan, PlanStep } from './reasoning-engine.js';
import { ActionExecutor, TestResult } from './action-executor.js';

// ============================================================================
// Types
// ============================================================================

export interface DevTeammateConfig {
    apiKey: string;
    workingDir: string;
    maxRetries?: number;
    dryRun?: boolean;
    testCommand?: string;
}

export interface ProcessResult {
    success: boolean;
    issue: Issue;
    plan?: RefactorPlan;
    attempts: AttemptResult[];
    finalMessage: string;
}

export interface AttemptResult {
    attempt: number;
    plan: RefactorPlan;
    testResult?: TestResult;
    error?: string;
    correction?: string;
}

// ============================================================================
// Dev Teammate Agent
// ============================================================================

export class DevTeammate {
    private reasoning: ReasoningEngine;
    private executor: ActionExecutor;
    private memory: ConstraintMemory;
    private maxRetries: number;
    private testCommand: string;

    constructor(config: DevTeammateConfig) {
        this.reasoning = new ReasoningEngine(config.apiKey);
        this.executor = new ActionExecutor(config.workingDir, config.dryRun ?? false);
        this.memory = constraintMemory;
        this.maxRetries = config.maxRetries ?? 3;
        this.testCommand = config.testCommand ?? 'npm test';
    }

    /**
     * Main entry point - process a GitHub issue
     */
    async processIssue(issue: Issue): Promise<ProcessResult> {
        console.log('\n' + '═'.repeat(70));
        console.log('🤖 DEV TEAMMATE - Processing Issue');
        console.log('═'.repeat(70));
        console.log(`📋 Issue: ${issue.title}`);
        console.log(`📝 Body: ${issue.body.slice(0, 100)}...`);

        const attempts: AttemptResult[] = [];

        try {
            // Step 1: Analyze issue
            console.log('\n📊 Step 1: Analyzing issue...');
            const analysis = await this.reasoning.analyzeIssue(issue);
            console.log(`   Intent: ${analysis.intent}`);
            console.log(`   Scope: ${analysis.scope}`);

            // Step 2: Recall constraints
            console.log('\n📌 Step 2: Recalling constraints...');
            const constraintContext = this.memory.formatForContext(analysis.scope);
            console.log(constraintContext);

            // Step 3: Get codebase context
            console.log('\n📁 Step 3: Reading codebase...');
            const fileTree = await this.executor.getFileTree();
            const codeContext = {
                files: new Map<string, string>(),
                structure: fileTree,
            };

            // Step 4: Self-correcting execution loop
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                console.log(`\n🔄 Attempt ${attempt}/${this.maxRetries}`);
                console.log('─'.repeat(50));

                // Plan
                console.log('\n🧠 Planning changes...');
                const plan = await this.reasoning.planRefactor(issue, codeContext, constraintContext);
                console.log(`   Summary: ${plan.summary}`);
                console.log(`   Steps: ${plan.steps.length}`);
                console.log(`   Complexity: ${plan.estimatedComplexity}`);

                // Check for constraint violations before executing
                const violations = this.memory.checkViolations(
                    { files: plan.affectedFiles, actions: plan.steps.map(s => s.description) },
                    analysis.scope
                );

                if (violations.length > 0) {
                    console.log('\n⚠️ Constraint violations detected:');
                    for (const v of violations) {
                        console.log(`   - ${v.constraint.rule}`);
                    }

                    attempts.push({
                        attempt,
                        plan,
                        error: `Constraint violation: ${violations[0]?.constraint.rule}`,
                        correction: 'Adjusting plan to respect constraints',
                    });
                    continue; // Retry with adjusted plan
                }

                // Execute
                console.log('\n⚡ Executing changes...');
                const execResult = await this.executeSteps(plan.steps);

                if (!execResult.success) {
                    console.log(`\n❌ Execution failed: ${execResult.error}`);
                    await this.executor.rollback();

                    attempts.push({
                        attempt,
                        plan,
                        error: execResult.error,
                        correction: 'Rolling back and retrying',
                    });
                    continue;
                }

                // Test
                console.log('\n🧪 Running tests...');
                const testResult = await this.executor.runTests(this.testCommand);

                attempts.push({
                    attempt,
                    plan,
                    testResult,
                });

                if (testResult.passed) {
                    console.log('\n✅ SUCCESS! All tests passed.');
                    return {
                        success: true,
                        issue,
                        plan,
                        attempts,
                        finalMessage: `Successfully implemented: ${issue.title}. Completed in ${attempt} attempt(s).`,
                    };
                }

                // Self-correct
                console.log('\n🔧 Self-correcting...');
                await this.executor.rollback();

                // Analyze errors and update plan
                for (const error of testResult.errors) {
                    console.log(`   Analyzing: ${error.message}`);
                    // In real implementation, would use reasoning.analyzeError here
                }
            }

            // Max retries exceeded
            return {
                success: false,
                issue,
                attempts,
                finalMessage: `Failed after ${this.maxRetries} attempts. Manual intervention required.`,
            };

        } catch (error) {
            console.error('\n❌ Fatal error:', error);
            return {
                success: false,
                issue,
                attempts,
                finalMessage: `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Execute plan steps
     */
    private async executeSteps(steps: PlanStep[]): Promise<{ success: boolean; error?: string }> {
        try {
            for (const step of steps) {
                console.log(`   [${step.order}] ${step.action.toUpperCase()}: ${step.file}`);

                if (step.action === 'delete') {
                    await this.executor.deleteFile(step.file);
                } else {
                    const existingCode = await this.executor.readFile(step.file);
                    const code = step.code ?? await this.reasoning.generateCode(
                        step,
                        existingCode,
                        step.description
                    );
                    await this.executor.writeFile(step.file, code);
                }
            }
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Add a constraint to memory
     */
    addConstraint(
        type: 'file_protect' | 'require' | 'forbid' | 'preference',
        rule: string,
        scope: string = '*'
    ): void {
        this.memory.store(type, rule, scope);
    }

    /**
     * Get memory instance for external access
     */
    getMemory(): ConstraintMemory {
        return this.memory;
    }
}

// Export types
export type { Issue, RefactorPlan, PlanStep } from './reasoning-engine.js';
export type { TestResult, FileChange } from './action-executor.js';
export type { Constraint, ConstraintType } from './constraint-memory.js';
