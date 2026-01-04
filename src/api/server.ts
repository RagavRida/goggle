/**
 * API Server
 * 
 * Express + WebSocket server for ContextOS frontend integration.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ContextOS } from '../index.js';
import { createRoutes } from './routes.js';
import { Event } from '../types/index.js';

const PORT = process.env.PORT ?? 3001;

// Track connected WebSocket clients
const clients = new Set<WebSocket>();

// Broadcast event to all connected clients
function broadcast(event: Event): void {
    const message = JSON.stringify(event);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

// Initialize ContextOS with event broadcasting
const contextos = new ContextOS({
    dbPath: process.env.DB_PATH ?? './contextos.db',
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: 'gemini-2.0-flash',
    githubToken: process.env.GITHUB_TOKEN,
    onEvent: (event) => {
        console.log(`[Event] ${event.type}:`, event.payload);
        broadcast(event);
    },
});

// Verify GitHub connection
if (contextos.github) {
    contextos.github.whoami().then((result) => {
        if (result.ok) {
            console.log(`✅ [GitHub] Connected as: ${result.value}`);
        } else {
            console.warn(`⚠️ [GitHub] Connection failed: ${result.error?.message}`);
        }
    });
}


// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api', createRoutes(contextos));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');
    clients.add(ws);

    // Send initial state
    ws.send(JSON.stringify({
        type: 'connection:established',
        timestamp: Date.now(),
        payload: {
            kernelState: contextos.kernel.getState(),
            stats: contextos.stats(),
        },
        source: 'server',
    }));

    ws.on('message', (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('[WebSocket] Received:', message);

            // Handle client messages
            switch (message.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;

                case 'execute':
                    // Create and start a task from WebSocket
                    const taskResult = contextos.kernel.createTask(
                        message.payload.name,
                        message.payload.input ?? {},
                        {
                            description: message.payload.description,
                            agentId: message.payload.agentId,
                        }
                    );
                    if (taskResult.ok) {
                        const task = taskResult.value;
                        contextos.kernel.startTask(task.id);

                        // For demo purposes, simulate a complete workflow
                        if (message.payload.name === 'demo-task') {
                            // Simulate async execution steps
                            setTimeout(() => {
                                broadcast({
                                    type: 'memory:retrieved',
                                    timestamp: Date.now(),
                                    payload: { count: 3, query: 'user preferences' },
                                    source: 'kernel',
                                });
                            }, 500);

                            setTimeout(() => {
                                broadcast({
                                    type: 'cache:hit',
                                    timestamp: Date.now(),
                                    payload: { strategy: 'deploy_workflow', confidence: 0.95 },
                                    source: 'kernel',
                                });
                            }, 1000);

                            setTimeout(() => {
                                broadcast({
                                    type: 'gemini:skipped',
                                    timestamp: Date.now(),
                                    payload: { reason: 'Using cached execution plan' },
                                    source: 'kernel',
                                });
                            }, 1500);

                            // Complete the task after simulation
                            setTimeout(() => {
                                contextos.kernel.completeTask(task.id, {
                                    success: true,
                                    message: 'Demo task completed successfully!',
                                    executionTime: '2.1s',
                                });
                                contextos.kernel.transition('execution_complete');
                                contextos.kernel.transition('verified');
                            }, 2000);
                        }
                    }
                    break;

                case 'stats':
                    ws.send(JSON.stringify({
                        type: 'stats:response',
                        timestamp: Date.now(),
                        payload: contextos.stats(),
                        source: 'server',
                    }));
                    break;
            }
        } catch (error) {
            console.error('[WebSocket] Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        clients.delete(ws);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    contextos.shutdown();
    wss.close();
    server.close();
    process.exit(0);
});

// Start server only if not running in Vercel
if (!process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ContextOS API Server                                        ║
║                                                               ║
║   REST API:    http://localhost:${PORT}/api                      ║
║   WebSocket:   ws://localhost:${PORT}/ws                         ║
║                                                               ║
║   Endpoints:                                                  ║
║     GET  /api/stats          - System statistics              ║
║     GET  /api/health         - Health check                   ║
║     GET  /api/demo/golden-run - Streaming Agent Demo          ║
║     POST /api/memory         - Create memory                  ║
║     GET  /api/memory         - Retrieve memories              ║
║     POST /api/execute        - Execute task                   ║
║     GET  /api/tasks          - List all tasks                 ║
║     GET  /api/agents         - List all agents                ║
║     POST /api/agents         - Register agent                 ║
║     GET  /api/kernel/state   - Kernel state                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    });
}

export { app, server, wss, contextos };
