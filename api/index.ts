/**
 * Vercel Serverless API Entry Point
 * 
 * A lightweight version that works in Vercel's serverless environment
 * without requiring native modules like better-sqlite3.
 */

import express from 'express';
import cors from 'cors';
import { runGoldenDemo } from './runner.js';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        environment: 'vercel-serverless',
        agent: 'antigravity'
    });
});

// Demo: Golden Run (Streaming)
app.get('/api/demo/golden-run', async (req, res) => {
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

// Simple stats endpoint (no DB required)
app.get('/api/stats', (_req, res) => {
    res.json({
        agent: 'Antigravity',
        status: 'running',
        capabilities: ['memory-gating', 'constraint-enforcement', 'self-correction'],
        uptime: Date.now(),
    });
});

export default app;
