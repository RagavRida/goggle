/**
 * Dev Teammate Demo
 * 
 * Simulates the self-correcting agent workflow:
 * 1. Issue parsing
 * 2. Constraint recall
 * 3. Plan generation (mocked)
 * 4. Execution
 * 5. Self-correction on test failure
 */

import { ConstraintMemory } from '../src/agents/constraint-memory.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mock Components (Simulates without API)
// ============================================================================

interface Issue {
    id: string;
    title: string;
    body: string;
}

interface Plan {
    summary: string;
    steps: Array<{
        order: number;
        action: string;
        file: string;
        description: string;
    }>;
    affectedFiles: string[];
}

class MockReasoningEngine {
    private attemptCount = 0;

    async analyzeIssue(issue: Issue) {
        console.log('   🔍 Analyzing issue with Gemini...');
        await this.delay(500);
        return {
            intent: 'Refactor authentication module to use OAuth',
            scope: 'auth',
            requirements: ['Use OAuth 2.0', 'Support Google provider', 'Maintain backward compatibility'],
        };
    }

    async planRefactor(constraints: string): Promise<Plan> {
        console.log('   🧠 Planning refactor with Gemini...');
        await this.delay(500);

        // Check if we need to respect legacy_login.ts constraint
        const protectLegacy = constraints.includes('legacy_login.ts');

        this.attemptCount++;

        if (this.attemptCount === 1 && protectLegacy) {
            // First attempt doesn't respect constraint (to demonstrate self-correction)
            return {
                summary: 'Refactor auth to OAuth (ignoring constraints)',
                steps: [
                    { order: 1, action: 'modify', file: 'src/auth/oauth.ts', description: 'Create OAuth handler' },
                    { order: 2, action: 'modify', file: 'src/auth/legacy_login.ts', description: 'Update legacy login' }, // VIOLATION!
                ],
                affectedFiles: ['src/auth/oauth.ts', 'src/auth/legacy_login.ts'],
            };
        }

        // Correct plan that respects constraints
        return {
            summary: 'Refactor auth to OAuth (respecting constraints)',
            steps: [
                { order: 1, action: 'create', file: 'src/auth/oauth.ts', description: 'Create OAuth handler' },
                { order: 2, action: 'create', file: 'src/auth/google-provider.ts', description: 'Add Google provider' },
                { order: 3, action: 'modify', file: 'src/auth/index.ts', description: 'Export new modules' },
            ],
            affectedFiles: ['src/auth/oauth.ts', 'src/auth/google-provider.ts', 'src/auth/index.ts'],
        };
    }

    async generateCode(step: { file: string; description: string }): Promise<string> {
        this.attemptCount++;

        // Simulate code that might fail tests on first attempt
        if (this.attemptCount <= 2 && step.file.includes('oauth')) {
            return `// ${step.description}\n// BUG: Missing null check that will fail tests\nexport function authenticate(token) {\n  return token.verify(); // Will throw if token is null\n}`;
        }

        // Fixed code on retry
        return `// ${step.description}\nexport function authenticate(token: string | null) {\n  if (!token) {\n    throw new AuthError('Token required');\n  }\n  return verifyToken(token);\n}`;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class MockTestRunner {
    private runCount = 0;

    async runTests(): Promise<{ passed: boolean; output: string; errors: string[] }> {
        this.runCount++;
        console.log('   🧪 Running test suite...');
        await new Promise(resolve => setTimeout(resolve, 500));

        if (this.runCount === 1) {
            // First run fails
            return {
                passed: false,
                output: 'FAIL src/auth/oauth.test.ts\n  ✕ should handle null token (5ms)',
                errors: ['TypeError: Cannot read property "verify" of null at authenticate (oauth.ts:4)'],
            };
        }

        // Subsequent runs pass
        return {
            passed: true,
            output: 'PASS src/auth/oauth.test.ts\n  ✓ should authenticate valid token\n  ✓ should handle null token',
            errors: [],
        };
    }
}

// ============================================================================
// Demo Simulation
// ============================================================================

async function runDemo() {
    console.log('═'.repeat(70));
    console.log('  🤖 DEV TEAMMATE - Self-Correcting Agent Demo');
    console.log('═'.repeat(70));

    // Initialize components
    const memory = new ConstraintMemory();
    const reasoning = new MockReasoningEngine();
    const testRunner = new MockTestRunner();

    // ========================================
    // Setup: Add constraints from past interactions
    // ========================================
    console.log('\n📌 SETUP: Recording past constraints');
    console.log('─'.repeat(50));

    memory.store('file_protect', 'Do not touch legacy_login.ts - critical for backward compatibility', 'auth', {
        priority: 10,
        source: 'user',
        pattern: /legacy_login\.ts/,
    });

    memory.store('preference', 'Prefer Google as OAuth provider', 'auth', {
        priority: 5,
        source: 'learned',
    });

    // ========================================
    // Trigger: New issue opened
    // ========================================
    console.log('\n🎫 TRIGGER: New GitHub Issue');
    console.log('─'.repeat(50));

    const issue: Issue = {
        id: uuidv4(),
        title: 'Refactor the auth module to use OAuth',
        body: `We need to modernize our authentication system to use OAuth 2.0.

Requirements:
- Support Google login
- Keep existing session management
- Add proper error handling`,
    };

    console.log(`   Title: ${issue.title}`);
    console.log(`   Body: ${issue.body.slice(0, 80)}...`);

    // ========================================
    // Step 1: Analyze Issue
    // ========================================
    console.log('\n📊 STEP 1: Analyzing Issue');
    console.log('─'.repeat(50));

    const analysis = await reasoning.analyzeIssue(issue);
    console.log(`   Intent: ${analysis.intent}`);
    console.log(`   Scope: ${analysis.scope}`);
    console.log(`   Requirements: ${analysis.requirements.join(', ')}`);

    // ========================================
    // Step 2: Recall Constraints
    // ========================================
    console.log('\n📌 STEP 2: Recalling Constraints');
    console.log('─'.repeat(50));

    const constraints = memory.recall(analysis.scope);
    console.log(`   Found ${constraints.length} constraints:`);
    for (const c of constraints) {
        console.log(`   - [${c.type}] ${c.rule}`);
    }

    const constraintContext = memory.formatForContext(analysis.scope);

    // ========================================
    // Self-Correcting Loop
    // ========================================
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`\n${'═'.repeat(70)}`);
        console.log(`  🔄 ATTEMPT ${attempt}/${maxAttempts}`);
        console.log('═'.repeat(70));

        // Step 3: Plan
        console.log('\n🧠 STEP 3: Planning Changes');
        console.log('─'.repeat(50));

        const plan = await reasoning.planRefactor(constraintContext);
        console.log(`   Summary: ${plan.summary}`);
        console.log(`   Affected files:`);
        for (const file of plan.affectedFiles) {
            console.log(`     - ${file}`);
        }

        // Step 4: Check Violations
        console.log('\n🔍 STEP 4: Checking Constraint Violations');
        console.log('─'.repeat(50));

        const violations = memory.checkViolations(
            { files: plan.affectedFiles, actions: plan.steps.map(s => s.description) },
            analysis.scope
        );

        if (violations.length > 0) {
            console.log('   ⚠️ VIOLATIONS DETECTED:');
            for (const v of violations) {
                console.log(`     ❌ ${v.constraint.rule}`);
            }
            console.log('\n   → Adjusting plan and retrying...');
            continue; // Next attempt
        }

        console.log('   ✅ No violations. Proceeding to execute.');

        // Step 5: Execute
        console.log('\n⚡ STEP 5: Executing Changes');
        console.log('─'.repeat(50));

        for (const step of plan.steps) {
            console.log(`   [${step.order}] ${step.action.toUpperCase()}: ${step.file}`);
            const code = await reasoning.generateCode(step);
            console.log(`       Generated ${code.split('\n').length} lines of code`);
        }

        // Step 6: Test
        console.log('\n🧪 STEP 6: Running Tests');
        console.log('─'.repeat(50));

        const testResult = await testRunner.runTests();
        console.log(`   ${testResult.output}`);

        if (testResult.passed) {
            console.log('\n' + '═'.repeat(70));
            console.log('  ✅ SUCCESS! All tests passed.');
            console.log('═'.repeat(70));
            console.log(`\n📝 Would create PR with title: "Implement: ${issue.title}"`);
            console.log('   Completed in', attempt, 'attempt(s)');

            if (attempt > 1) {
                console.log('\n💡 Self-correction worked:');
                console.log('   - Detected constraint violations');
                console.log('   - Adjusted plan to protect legacy_login.ts');
                console.log('   - Fixed code bug after test failure');
            }
            return;
        }

        // Self-correct
        console.log('\n   ❌ Tests failed. Analyzing errors...');
        for (const error of testResult.errors) {
            console.log(`     Error: ${error}`);
        }
        console.log('\n   → Self-correcting and retrying with fixes...');
    }

    console.log('\n' + '═'.repeat(70));
    console.log('  ❌ FAILED: Max attempts exceeded');
    console.log('═'.repeat(70));
}

// ============================================================================
// Run
// ============================================================================

console.log('\n');
runDemo().then(() => {
    console.log('\n📋 DEMO COMPLETE\n');
    console.log('This demo simulated:');
    console.log('  1. GitHub issue triggering the agent');
    console.log('  2. Constraint memory recall ("Don\'t touch legacy_login.ts")');
    console.log('  3. Gemini-powered refactor planning');
    console.log('  4. Constraint violation detection and correction');
    console.log('  5. Test failure and self-correction');
    console.log('\nIn production, this would connect to:');
    console.log('  - Real GitHub webhooks');
    console.log('  - Real Gemini API');
    console.log('  - Real file system and test runner');
});
