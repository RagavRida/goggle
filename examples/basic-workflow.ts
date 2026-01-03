/**
 * Basic ContextOS Workflow Example
 * 
 * Demonstrates:
 * - Agent registration
 * - Memory storage and retrieval
 * - Task execution
 * - Inter-agent messaging
 */

import { ContextOS } from '../src/index.js';

async function main() {
    console.log('🚀 Starting ContextOS Example\n');

    // Initialize ContextOS (in-memory for demo)
    const os = new ContextOS({
        dbPath: ':memory:',
        // Uncomment and add your API key for Gemini integration:
        // geminiApiKey: process.env.GEMINI_API_KEY,
        onEvent: (event) => {
            console.log(`📡 Event: ${event.type}`, event.payload);
        },
    });

    // ============================================
    // 1. Register Agents
    // ============================================
    console.log('--- Agent Registration ---');

    const plannerResult = os.registry.register('Planner Agent', ['planning', 'analysis']);
    const executorResult = os.registry.register('Executor Agent', ['execution', 'tools']);

    if (!plannerResult.ok || !executorResult.ok) {
        console.error('Failed to register agents');
        return;
    }

    const planner = plannerResult.value;
    const executor = executorResult.value;

    console.log(`✅ Registered: ${planner.name} (${planner.id})`);
    console.log(`✅ Registered: ${executor.name} (${executor.id})`);

    // ============================================
    // 2. Store Memories
    // ============================================
    console.log('\n--- Memory Storage ---');

    // Store a fact
    const factResult = os.memory.create(
        'fact',
        { key: 'project_name', value: 'ContextOS Demo' },
        planner.id,
        'task-001',
        { tags: ['project', 'metadata'], priority: 8 }
    );

    if (factResult.ok) {
        console.log(`📝 Stored fact: ${factResult.value.id}`);
    }

    // Store a decision
    const decisionResult = os.memory.create(
        'decision',
        {
            decision: 'Use TypeScript for implementation',
            reasoning: 'Type safety and better tooling',
            alternatives: ['JavaScript', 'Python']
        },
        planner.id,
        'task-001',
        { tags: ['architecture', 'language'], priority: 9 }
    );

    if (decisionResult.ok) {
        console.log(`📝 Stored decision: ${decisionResult.value.id}`);
    }

    // Store observations
    for (let i = 0; i < 3; i++) {
        os.memory.create(
            'observation',
            { observation: `Observation ${i + 1}`, timestamp: Date.now() },
            executor.id,
            'task-001',
            { tags: ['log'], priority: 3 }
        );
    }
    console.log('📝 Stored 3 observations');

    // ============================================
    // 3. Query Memories
    // ============================================
    console.log('\n--- Memory Retrieval ---');

    // Get all memories for a task
    const taskMemories = os.memory.query({ taskId: 'task-001' });
    if (taskMemories.ok) {
        console.log(`📖 Found ${taskMemories.value.length} memories for task-001`);
    }

    // Get high-priority items
    const highPriority = os.memory.query({
        taskId: 'task-001',
        limit: 5
    });
    if (highPriority.ok) {
        const items = highPriority.value.filter(m => m.metadata.priority >= 7);
        console.log(`📖 Found ${items.length} high-priority memories`);
    }

    // Get by type
    const decisions = os.memory.query({ types: ['decision'] });
    if (decisions.ok) {
        console.log(`📖 Found ${decisions.value.length} decisions`);
    }

    // ============================================
    // 4. Context Retrieval
    // ============================================
    console.log('\n--- Context Retrieval ---');

    const contextResult = await os.recall({
        taskId: 'task-001',
        limit: 5,
    });

    if (contextResult.ok) {
        console.log(`🔍 Retrieved ${contextResult.value.entries.length} context entries`);
        console.log(`   Total tokens: ${contextResult.value.totalTokens}`);
        console.log(`   Truncated: ${contextResult.value.truncated}`);
    }

    // ============================================
    // 5. Task Execution
    // ============================================
    console.log('\n--- Task Execution ---');

    // Create a task
    const taskResult = os.kernel.createTask(
        'Analyze project requirements',
        { requirements: ['memory', 'coordination', 'extensibility'] },
        { agentId: planner.id }
    );

    if (taskResult.ok) {
        console.log(`📋 Created task: ${taskResult.value.name} (${taskResult.value.id})`);

        // Start the task
        const startResult = os.kernel.startTask(taskResult.value.id);
        if (startResult.ok) {
            console.log(`▶️  Started task: ${startResult.value.status}`);

            // Complete the task
            const completeResult = os.kernel.completeTask(
                taskResult.value.id,
                { analysis: 'Requirements validated', score: 95 }
            );

            if (completeResult.ok) {
                console.log(`✅ Completed task: ${JSON.stringify(completeResult.value.output)}`);
            }
        }
    }

    // ============================================
    // 6. Inter-Agent Messaging
    // ============================================
    console.log('\n--- Messaging ---');

    // Subscribe executor to messages
    os.bus.subscribe(executor.id, (message) => {
        console.log(`📨 ${executor.name} received: ${message.type}`, message.payload);
    });

    // Planner sends a command to executor
    const msgResult = os.bus.publish(
        'command',
        planner.id,
        executor.id,
        { action: 'execute_step', step: 1, data: { tool: 'file_reader' } }
    );

    if (msgResult.ok) {
        console.log(`📤 Sent message: ${msgResult.value.id}`);
    }

    // Broadcast to all
    os.bus.broadcast(planner.id, { announcement: 'Task phase complete' }, 'event');
    console.log('📢 Broadcast sent to all agents');

    // ============================================
    // 7. System Statistics
    // ============================================
    console.log('\n--- System Stats ---');

    const stats = os.stats();
    console.log('Memory:', JSON.stringify(stats.memory, null, 2));
    console.log('Kernel:', JSON.stringify(stats.kernel, null, 2));
    console.log('Registry:', JSON.stringify(stats.registry, null, 2));
    console.log('Bus:', JSON.stringify(stats.bus, null, 2));

    // ============================================
    // 8. Cleanup
    // ============================================
    console.log('\n--- Cleanup ---');
    os.shutdown();
    console.log('✅ ContextOS shutdown complete');
}

main().catch(console.error);
