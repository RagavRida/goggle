/**
 * Intent Classification Examples
 * 
 * Demonstrates the IntentClassifier with various input types.
 */

import { IntentClassifier, IntentCategory } from '../src/kernel/classifier.js';

// Initialize classifier
const classifier = new IntentClassifier({
    confidenceThreshold: 0.3,
    explainability: true,
});

// Example inputs organized by expected category
const testCases: Array<{ input: string; expected: IntentCategory }> = [
    // ============ FAST_PATH ============
    { input: 'Hello!', expected: 'fast_path' },
    { input: 'Hi there', expected: 'fast_path' },
    { input: 'Thanks!', expected: 'fast_path' },
    { input: 'Ok', expected: 'fast_path' },
    { input: 'What time is it?', expected: 'fast_path' },
    { input: 'ping', expected: 'fast_path' },

    // ============ FACTUAL ============
    { input: 'What is TypeScript?', expected: 'factual' },
    { input: 'Explain how closures work in JavaScript', expected: 'factual' },
    { input: 'Who invented the internet?', expected: 'factual' },
    { input: 'How does DNS resolution work?', expected: 'factual' },
    { input: 'Translate hello to French', expected: 'factual' },
    { input: 'What are the differences between SQL and NoSQL?', expected: 'factual' },

    // ============ WORKFLOW ============
    { input: 'Create a REST API for user authentication', expected: 'workflow' },
    { input: 'Build a todo app with React', expected: 'workflow' },
    { input: 'Refactor this function to use async/await', expected: 'workflow' },
    { input: 'Add a new endpoint to the server', expected: 'workflow' },
    { input: 'Debug the login flow', expected: 'workflow' },
    { input: 'Based on our earlier discussion, implement the auth module', expected: 'workflow' },
    { input: 'Remember that we need to use PostgreSQL', expected: 'workflow' },

    // ============ HIGH_RISK ============
    { input: 'Delete all user data from the database', expected: 'high_risk' },
    { input: 'Deploy to production immediately', expected: 'high_risk' },
    { input: 'rm -rf node_modules', expected: 'high_risk' },
    { input: 'Reset the production database', expected: 'high_risk' },
    { input: 'Push to main branch with force', expected: 'high_risk' },
    { input: 'Update the API key in production', expected: 'high_risk' },
];

// Run classification
console.log('='.repeat(80));
console.log('INTENT CLASSIFICATION EXAMPLES');
console.log('='.repeat(80));
console.log();

let correct = 0;
let total = testCases.length;
const results: Array<{
    input: string;
    expected: IntentCategory;
    actual: IntentCategory;
    confidence: number;
    latencyMs: number;
    match: boolean;
}> = [];

for (const { input, expected } of testCases) {
    const result = classifier.classify({ input });

    if (result.ok) {
        const { intent, confidence, latencyMs } = result.value;
        const match = intent === expected;
        if (match) correct++;

        results.push({
            input: input.slice(0, 50),
            expected,
            actual: intent,
            confidence,
            latencyMs,
            match,
        });
    }
}

// Group by category and display
const categories: IntentCategory[] = ['fast_path', 'factual', 'workflow', 'high_risk'];

for (const category of categories) {
    const categoryResults = results.filter(r => r.expected === category);

    console.log(`\n## ${category.toUpperCase()}`);
    console.log('-'.repeat(70));

    for (const r of categoryResults) {
        const status = r.match ? '✅' : '❌';
        const conf = (r.confidence * 100).toFixed(0).padStart(3) + '%';
        const lat = r.latencyMs.toFixed(2).padStart(6) + 'ms';

        console.log(`${status} ${conf} ${lat} | "${r.input}"`);
        if (!r.match) {
            console.log(`   └─ Expected: ${r.expected}, Got: ${r.actual}`);
        }
    }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Accuracy: ${correct}/${total} (${((correct / total) * 100).toFixed(1)}%)`);
console.log(`Average latency: ${(results.reduce((a, r) => a + r.latencyMs, 0) / results.length).toFixed(2)}ms`);
console.log();

// Detailed example with explanation
console.log('DETAILED CLASSIFICATION EXAMPLE');
console.log('-'.repeat(70));

const detailedInput = 'Create a REST API for user authentication';
const detailedResult = classifier.classify({ input: detailedInput });

if (detailedResult.ok) {
    const r = detailedResult.value;
    console.log(`Input: "${detailedInput}"`);
    console.log(`Intent: ${r.intent}`);
    console.log(`Confidence: ${(r.confidence * 100).toFixed(1)}%`);
    console.log(`Latency: ${r.latencyMs.toFixed(2)}ms`);
    console.log(`Explanation: ${r.explanation}`);
    console.log(`\nScores:`);
    for (const [cat, score] of Object.entries(r.scores)) {
        const bar = '█'.repeat(Math.round(score * 20));
        console.log(`  ${cat.padEnd(12)} ${(score * 100).toFixed(0).padStart(3)}% ${bar}`);
    }
    console.log(`\nSignals matched:`);
    for (const signal of r.signals) {
        console.log(`  - ${signal}`);
    }
}

// Execution path info
console.log('\nEXECUTION PATHS');
console.log('-'.repeat(70));
for (const category of categories) {
    const path = classifier.getExecutionPath(category);
    console.log(`${category}:`);
    console.log(`  Memory: ${path.requiresMemory ? 'Yes' : 'No'}`);
    console.log(`  Agents: ${path.requiresAgents ? 'Yes' : 'No'}`);
    console.log(`  Guard:  ${path.requiresGuard ? 'Yes' : 'No'}`);
    console.log(`  Max Latency: ${path.maxLatencyMs}ms`);
}
