/**
 * "The Amnesiac Refactor" - Golden Run Demo
 * 
 * A complete scenario exercising all ContextOS verified behaviors in ~2 minutes:
 * 
 * 1. CONSTRAINT INJECTION: "Never use arrow functions in legacy module"
 * 2. MEMORY GATING: Store the constraint
 * 3. CONTEXT RETRIEVAL: Recall constraint when processing task
 * 4. INTENT CLASSIFICATION: Classify as "workflow"
 * 5. REASONING: Plan the refactor respecting constraints
 * 6. EXECUTION: Write code with async functions (not arrow)
 * 7. SELF-CORRECTION: Handle test failure and fix automatically
 */

import { ConstraintMemory } from '../src/agents/constraint-memory.js';
import { IntentClassifier } from '../src/kernel/classifier.js';
import { eventBus } from '../src/events/event-bus.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const DEMO_DIR = path.join(process.cwd(), 'examples/demo-files');

// ============================================================================
// Mock Components
// ============================================================================

class MockGeminiReasoning {
    private attemptCount = 0;

    async plan(task: string, constraints: string): Promise<{
        summary: string;
        code: string;
        usesArrowFunctions: boolean;
    }> {
        this.attemptCount++;

        // Check if we need to respect the "no arrow functions" constraint
        const noArrowFunctions = constraints.toLowerCase().includes('arrow function');

        eventBus.reasoningStart({ prompt: task, model: 'gemini-2.0-flash' });
        await this.delay(800);

        if (this.attemptCount === 1 && !noArrowFunctions) {
            // First attempt ignores constraints (for demo)
            const code = this.generateCodeWithArrows();
            eventBus.reasoningComplete({ model: 'gemini-2.0-flash' });
            return { summary: 'Refactored to async/await (with arrows)', code, usesArrowFunctions: true };
        }

        // Correct code respecting constraints
        const code = this.generateCodeWithoutArrows();
        eventBus.reasoningComplete({ model: 'gemini-2.0-flash' });
        return { summary: 'Refactored to async/await (standard functions)', code, usesArrowFunctions: false };
    }

    private generateCodeWithArrows(): string {
        return `/**
 * Auth Module - Refactored (INCORRECT - uses arrow functions)
 */
import crypto from 'crypto';
import { db } from './db.js';

const sessions: Map<string, Session> = new Map();

// ❌ VIOLATION: Arrow function in legacy module
export const authenticate = async (username: string, password: string) => {
  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
  const user = await db.findUser(username);
  
  if (!user || user.password !== hashedPassword) {
    throw new Error('Invalid credentials');
  }
  
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { userId: user.id, username, createdAt: Date.now() });
  
  return { sessionId, user };
};
`;
    }

    private generateCodeWithoutArrows(): string {
        return `/**
 * Auth Module - Refactored to Async/Await
 * 
 * ✅ Uses standard functions (not arrow functions)
 * ✅ Respects legacy module constraints
 */
import crypto from 'crypto';
import { db } from './db.js';

interface Session {
  userId: string;
  username: string;
  createdAt: number;
}

const sessions: Map<string, Session> = new Map();

/**
 * Authenticate user with username and password
 */
export async function authenticate(username: string, password: string) {
  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
  const user = await db.findUser(username);
  
  if (!user || user.password !== hashedPassword) {
    throw new Error('Invalid credentials');
  }
  
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { userId: user.id, username, createdAt: Date.now() });
  
  return { sessionId, user };
}

/**
 * Verify session token
 */
export async function verifySession(sessionId: string) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    throw new Error('Invalid session');
  }
  
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (Date.now() - session.createdAt > maxAge) {
    sessions.delete(sessionId);
    throw new Error('Session expired');
  }
  
  return session;
}

/**
 * Logout user
 */
export async function logout(sessionId: string) {
  if (!sessions.has(sessionId)) {
    throw new Error('Session not found');
  }
  sessions.delete(sessionId);
  return { success: true };
}
`;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class MockTestRunner {
    private runCount = 0;

    async run(code: string): Promise<{ passed: boolean; output: string; errors: string[] }> {
        this.runCount++;
        eventBus.emit('test_start', { attempt: this.runCount });
        await new Promise(resolve => setTimeout(resolve, 600));

        // Check for arrow functions
        const hasArrowFunctions = code.includes('=>');

        if (hasArrowFunctions) {
            const result = {
                passed: false,
                output: 'FAIL auth.test.ts\n  ✕ should not use arrow functions in legacy module',
                errors: ['ESLint Error: Arrow functions are not allowed in legacy modules (no-arrow-functions)'],
            };
            eventBus.testResult({ passed: false, total: 5, failed: 1, errors: result.errors });
            return result;
        }

        if (this.runCount === 1) {
            // First run fails (for demo)
            const result = {
                passed: false,
                output: 'FAIL auth.test.ts\n  ✕ should handle missing db connection',
                errors: ['TypeError: db.findUser is not a function'],
            };
            eventBus.testResult({ passed: false, total: 5, failed: 1, errors: result.errors });
            return result;
        }

        const result = {
            passed: true,
            output: 'PASS auth.test.ts\n  ✓ authenticate\n  ✓ verifySession\n  ✓ logout\n  ✓ respects constraints',
            errors: [],
        };
        eventBus.testResult({ passed: true, total: 4, failed: 0 });
        return result;
    }
}

// ============================================================================
// Golden Run Demo
// ============================================================================

async function goldenRun() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                    THE AMNESIAC REFACTOR                             ║');
    console.log('║              ContextOS Golden Run Demo (~2 min)                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Initialize components
    const memory = new ConstraintMemory();
    const classifier = new IntentClassifier();
    const reasoning = new MockGeminiReasoning();
    const testRunner = new MockTestRunner();

    const startTime = Date.now();

    // ═══════════════════════════════════════════════════════════════════════════
    // TURN 1: Constraint Injection
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('╭─────────────────────────────────────────────────────────────────────╮');
    console.log('│ 👤 USER TURN 1: Constraint Injection                                │');
    console.log('╰─────────────────────────────────────────────────────────────────────╯');
    console.log('\n💬 "Hey, remember: never use arrow functions in the legacy module,');
    console.log('    only standard functions."\n');

    await delay(500);

    // Memory gating
    const constraintInput = 'never use arrow functions in the legacy module, only standard functions';
    const entropy = 1.0; // Novel information
    eventBus.memoryGating({
        input: constraintInput,
        entropy: entropy,
        similarity: 0,
        gateStatus: 'open',
    });
    console.log(`   🚪 [GATING] Entropy: ${entropy.toFixed(2)} → Gate OPEN`);

    // Store constraint
    const constraint = memory.store(
        'forbid',
        'Never use arrow functions in legacy modules - use standard function declarations only',
        'auth',
        { priority: 10, source: 'user' }
    );

    eventBus.constraintLoaded({
        constraint: { type: constraint.type, rule: constraint.rule, scope: constraint.scope },
        action: 'loaded',
    });

    console.log('\n   ✅ SYSTEM: Stored constraint in memory.\n');
    await delay(1000);

    // ═══════════════════════════════════════════════════════════════════════════
    // TURN 2: The Task
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('╭─────────────────────────────────────────────────────────────────────╮');
    console.log('│ 👤 USER TURN 2: The Refactor Task                                   │');
    console.log('╰─────────────────────────────────────────────────────────────────────╯');
    console.log('\n💬 "Refactor auth.ts to use Async/Await. Run tests when done."\n');

    await delay(500);

    // Step 1: Intent Classification
    console.log('┌─ STEP 1: Intent Classification ─────────────────────────────────────┐');
    const taskInput = 'Refactor auth.ts to use Async/Await. Run tests when done.';
    const classification = classifier.classify({ input: taskInput });

    if (classification.ok) {
        const { intent, confidence, latencyMs } = classification.value;
        console.log(`│  Intent: ${intent.toUpperCase()}`);
        console.log(`│  Confidence: ${(confidence * 100).toFixed(0)}%`);
        console.log(`│  Latency: ${latencyMs.toFixed(2)}ms`);
        console.log(`│  → Routing to Dev Teammate Agent`);
    }
    console.log('└──────────────────────────────────────────────────────────────────────┘\n');

    await delay(500);

    // Step 2: Context Retrieval
    console.log('┌─ STEP 2: Context Retrieval ──────────────────────────────────────────┐');
    const constraints = memory.recall('auth');
    console.log(`│  Scope: auth`);
    console.log(`│  Recalled: ${constraints.length} constraint(s)`);

    for (const c of constraints) {
        console.log(`│  📌 [${c.type}] "${c.rule}"`);
    }

    eventBus.contextRetrieved({
        query: 'auth refactor constraints',
        results: constraints.map(c => ({ content: c.rule, confidence: 1.0 })),
        tokenCount: 150,
    });
    console.log('└──────────────────────────────────────────────────────────────────────┘\n');

    await delay(500);

    // Step 3: Read Legacy File
    console.log('┌─ STEP 3: Reading Legacy File ────────────────────────────────────────┐');
    try {
        const legacyCode = await fs.readFile(path.join(DEMO_DIR, 'legacy-auth.js'), 'utf-8');
        const lines = legacyCode.split('\n').slice(0, 10);
        console.log('│  File: legacy-auth.js');
        console.log('│  Preview:');
        for (const line of lines) {
            console.log(`│    ${line}`);
        }
        console.log('│    ...');
    } catch {
        console.log('│  [Legacy file would be read here]');
    }
    console.log('└──────────────────────────────────────────────────────────────────────┘\n');

    // ═══════════════════════════════════════════════════════════════════════════
    // Self-Correcting Loop
    // ═══════════════════════════════════════════════════════════════════════════

    const maxAttempts = 3;
    const constraintContext = memory.formatForContext('auth');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`\n${'═'.repeat(74)}`);
        console.log(`  🔄 ATTEMPT ${attempt}/${maxAttempts}`);
        console.log('═'.repeat(74));

        // Step 4: Reasoning
        console.log('\n┌─ STEP 4: Reasoning (Gemini) ────────────────────────────────────────┐');
        console.log('│  🧠 Thinking...');

        const plan = await reasoning.plan(taskInput, constraintContext);

        console.log(`│  Summary: ${plan.summary}`);
        console.log(`│  Uses Arrow Functions: ${plan.usesArrowFunctions ? '❌ YES' : '✅ NO'}`);
        console.log('└──────────────────────────────────────────────────────────────────────┘');

        // Check constraint violation before execution
        if (plan.usesArrowFunctions) {
            console.log('\n   ⚠️  CONSTRAINT VIOLATION DETECTED!');
            console.log('   📌 Rule: "Never use arrow functions in legacy modules"');
            eventBus.constraintViolation({
                constraint: { type: 'forbid', rule: 'No arrow functions', scope: 'auth' },
                action: 'violated',
            });
            eventBus.selfCorrection('Arrow function constraint violated', attempt);
            console.log('   → Self-correcting: Regenerating with constraints...\n');
            await delay(500);
            continue;
        }

        // Step 5: Execution
        console.log('\n┌─ STEP 5: Executing Changes ─────────────────────────────────────────┐');
        eventBus.emit('execution_start', { file: 'auth.ts' });
        console.log('│  📝 Writing refactored code...');
        console.log('│  File: src/auth.ts');
        console.log('│  Lines: ' + plan.code.split('\n').length);
        eventBus.emit('execution_complete', { file: 'auth.ts', linesChanged: plan.code.split('\n').length });
        console.log('└──────────────────────────────────────────────────────────────────────┘');

        // Step 6: Testing
        console.log('\n┌─ STEP 6: Running Tests ─────────────────────────────────────────────┐');
        const testResult = await testRunner.run(plan.code);
        console.log(`│  ${testResult.output.split('\n').join('\n│  ')}`);
        console.log('└──────────────────────────────────────────────────────────────────────┘');

        if (testResult.passed) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
            console.log('║                         ✅ SUCCESS!                                  ║');
            console.log('╚══════════════════════════════════════════════════════════════════════╝');
            console.log(`\n   ⏱️  Completed in ${duration}s (${attempt} attempt(s))`);
            console.log('\n   📝 Would create PR: "Refactor auth.ts to async/await"\n');

            // Summary of what happened
            console.log('╭─────────────────────────────────────────────────────────────────────╮');
            console.log('│ 💡 CONTEXTOS BEHAVIORS DEMONSTRATED:                                │');
            console.log('├─────────────────────────────────────────────────────────────────────┤');
            console.log('│  ✓ Memory Gating: Stored constraint with entropy check             │');
            console.log('│  ✓ Intent Classification: "workflow" detected in <1ms              │');
            console.log('│  ✓ Context Retrieval: Recalled "no arrow functions" constraint     │');
            console.log('│  ✓ Constraint Respect: Used async function (not arrow)             │');
            if (attempt > 1) {
                console.log('│  ✓ Self-Correction: Fixed issues automatically                     │');
            }
            console.log('╰─────────────────────────────────────────────────────────────────────╯\n');
            return;
        }

        // Self-correct on test failure
        console.log('\n   ❌ Tests failed. Analyzing errors...');
        for (const error of testResult.errors) {
            console.log(`      ${error}`);
        }
        eventBus.selfCorrection(testResult.errors[0] || 'Test failure', attempt);
        console.log('   → Self-correcting: Adjusting code...\n');
        await delay(500);
    }

    console.log('\n❌ FAILED: Max attempts exceeded\n');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Run
// ============================================================================

goldenRun().catch(console.error);
