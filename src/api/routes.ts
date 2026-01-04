/**
 * API Routes
 * 
 * REST API handlers for ContextOS kernel operations.
 */

import { Router, Request, Response } from 'express';
import { ContextOS } from '../index.js';

export function createRoutes(contextos: ContextOS): Router {
    const router = Router();

    // Health check
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get system statistics
    router.get('/stats', (_req: Request, res: Response) => {
        try {
            const stats = contextos.stats();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Memory operations
    router.post('/memory', async (req: Request, res: Response) => {
        try {
            const { type, content, agentId, taskId, tags, priority, ttl, generateEmbedding } = req.body;

            if (!type || !content || !agentId || !taskId) {
                res.status(400).json({ error: 'Missing required fields: type, content, agentId, taskId' });
                return;
            }

            const result = await contextos.remember(type, content, agentId, taskId, {
                tags,
                priority,
                ttl,
                generateEmbedding,
            });

            if (result.ok) {
                res.json(result.value);
            } else {
                res.status(500).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    router.get('/memory', async (req: Request, res: Response) => {
        try {
            const { query, agentId, taskId, tags, limit } = req.query;

            const result = await contextos.recall({
                query: query as string | undefined,
                agentId: agentId as string | undefined,
                taskId: taskId as string | undefined,
                tags: tags ? (tags as string).split(',') : undefined,
                limit: limit ? parseInt(limit as string, 10) : undefined,
            });

            if (result.ok) {
                res.json(result.value);
            } else {
                res.status(500).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Task execution
    router.post('/execute', (req: Request, res: Response) => {
        try {
            const { name, input, description, agentId, parentTaskId, metadata } = req.body;

            if (!name) {
                res.status(400).json({ error: 'Missing required field: name' });
                return;
            }

            const task = contextos.kernel.createTask(name, input ?? {}, {
                description,
                agentId,
                parentTaskId,
                metadata,
            });

            if (task.ok) {
                // Auto-start the task
                contextos.kernel.startTask(task.value.id);
                res.json(task.value);
            } else {
                res.status(500).json({ error: task.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Complete a task
    router.post('/execute/:taskId/complete', (req: Request, res: Response) => {
        try {
            const { taskId } = req.params;
            const { output } = req.body;

            const result = contextos.kernel.completeTask(taskId, output);
            if (result.ok) {
                res.json(result.value);
            } else {
                res.status(400).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Get all tasks
    router.get('/tasks', (_req: Request, res: Response) => {
        try {
            const tasks = contextos.kernel.getAllTasks();
            res.json(tasks);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Get a specific task
    router.get('/tasks/:taskId', (req: Request, res: Response) => {
        try {
            const task = contextos.kernel.getTask(req.params.taskId);
            if (task) {
                res.json(task);
            } else {
                res.status(404).json({ error: 'Task not found' });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Agent operations
    router.get('/agents', (_req: Request, res: Response) => {
        try {
            const result = contextos.registry.getAll();
            if (result.ok) {
                res.json(result.value);
            } else {
                res.status(500).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    router.post('/agents', (req: Request, res: Response) => {
        try {
            const { name, capabilities, config, metadata } = req.body;

            if (!name || !capabilities) {
                res.status(400).json({ error: 'Missing required fields: name, capabilities' });
                return;
            }

            const result = contextos.registry.register(name, capabilities, config, metadata);
            if (result.ok) {
                res.json(result.value);
            } else {
                res.status(500).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    router.get('/agents/:agentId', (req: Request, res: Response) => {
        try {
            const result = contextos.registry.get(req.params.agentId);
            if (result.ok && result.value) {
                res.json(result.value);
            } else if (result.ok) {
                res.status(404).json({ error: 'Agent not found' });
            } else {
                res.status(500).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Kernel state
    router.get('/kernel/state', (_req: Request, res: Response) => {
        try {
            res.json({ state: contextos.kernel.getState() });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    router.post('/kernel/transition', (req: Request, res: Response) => {
        try {
            const { event } = req.body;
            if (!event) {
                res.status(400).json({ error: 'Missing required field: event' });
                return;
            }

            const result = contextos.kernel.transition(event);
            if (result.ok) {
                res.json({ state: result.value });
            } else {
                res.status(400).json({ error: result.error.message });
            }
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // Demo: Golden Run (Streaming)
    router.get('/demo/golden-run', async (req: Request, res: Response) => {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        try {
            await runGoldenDemo((message) => {
                // Send each log line as an SSE data event
                res.write(`data: ${JSON.stringify({ message })}\n\n`);
            });
            res.write('event: complete\ndata: "Done"\n\n');
        } catch (error) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
        } finally {
            res.end();
        }
    });

    return router;
}

import { runGoldenDemo } from '../demo/runner.js';
