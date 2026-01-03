/**
 * Action Executor for Dev Teammate
 * 
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    ANTIGRAVITY-READY INTERFACE                           ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ This module implements file operations compatible with Google's          ║
 * ║ Antigravity Tool Definition schema. All methods can be mapped to         ║
 * ║ Antigravity tool calls with minimal adaptation.                          ║
 * ║                                                                          ║
 * ║ Tool Mapping:                                                            ║
 * ║   readFile()       → view_file (Antigravity)                             ║
 * ║   writeFile()      → write_to_file / replace_file_content                ║
 * ║   deleteFile()     → (delete operation via write_to_file)                ║
 * ║   runCommand()     → run_command                                         ║
 * ║   getFileTree()    → list_dir / find_by_name                             ║
 * ║   rollback()       → (undo via replace_file_content)                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Executes code changes and runs tests.
 * Provides rollback capability for failed changes.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface FileChange {
    path: string;
    action: 'create' | 'modify' | 'delete';
    content?: string;
    originalContent?: string;  // For rollback
}

export interface ExecutionResult {
    success: boolean;
    changes: FileChange[];
    output?: string;
    error?: string;
}

export interface TestResult {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errors: TestError[];
    output: string;
}

export interface TestError {
    file: string;
    line?: number;
    message: string;
    stack?: string;
}

// ============================================================================
// Antigravity Tool Definitions (Google Schema Compatible)
// ============================================================================

/**
 * Tool definitions matching Google's Antigravity tool schema.
 * These can be used to register this executor with an Antigravity-compatible runtime.
 */
export const ANTIGRAVITY_TOOL_DEFINITIONS = {
    view_file: {
        name: 'view_file',
        description: 'Read the contents of a file from the local filesystem.',
        parameters: {
            type: 'object',
            properties: {
                AbsolutePath: { type: 'string', description: 'Absolute path to file to view' },
                StartLine: { type: 'integer', description: 'Optional start line (1-indexed)' },
                EndLine: { type: 'integer', description: 'Optional end line (1-indexed)' },
            },
            required: ['AbsolutePath'],
        },
    },
    write_to_file: {
        name: 'write_to_file',
        description: 'Create or overwrite a file with new content.',
        parameters: {
            type: 'object',
            properties: {
                TargetFile: { type: 'string', description: 'Absolute path to target file' },
                CodeContent: { type: 'string', description: 'Content to write to the file' },
                Overwrite: { type: 'boolean', description: 'Whether to overwrite existing file' },
                Description: { type: 'string', description: 'Brief description of the change' },
            },
            required: ['TargetFile', 'CodeContent'],
        },
    },
    replace_file_content: {
        name: 'replace_file_content',
        description: 'Edit an existing file by replacing specific content.',
        parameters: {
            type: 'object',
            properties: {
                TargetFile: { type: 'string', description: 'Absolute path to target file' },
                TargetContent: { type: 'string', description: 'Exact content to replace' },
                ReplacementContent: { type: 'string', description: 'New content' },
                StartLine: { type: 'integer', description: 'Starting line number' },
                EndLine: { type: 'integer', description: 'Ending line number' },
            },
            required: ['TargetFile', 'TargetContent', 'ReplacementContent'],
        },
    },
    run_command: {
        name: 'run_command',
        description: 'Execute a shell command.',
        parameters: {
            type: 'object',
            properties: {
                CommandLine: { type: 'string', description: 'Command to execute' },
                Cwd: { type: 'string', description: 'Working directory' },
                SafeToAutoRun: { type: 'boolean', description: 'Whether safe to run without approval' },
            },
            required: ['CommandLine', 'Cwd'],
        },
    },
    list_dir: {
        name: 'list_dir',
        description: 'List contents of a directory.',
        parameters: {
            type: 'object',
            properties: {
                DirectoryPath: { type: 'string', description: 'Absolute path to directory' },
            },
            required: ['DirectoryPath'],
        },
    },
} as const;

export type AntigravityToolName = keyof typeof ANTIGRAVITY_TOOL_DEFINITIONS;

// ============================================================================
// Action Executor
// ============================================================================

export class ActionExecutor {
    private workingDir: string;
    private changeHistory: FileChange[][] = [];
    private dryRun: boolean;

    constructor(workingDir: string, dryRun = false) {
        this.workingDir = workingDir;
        this.dryRun = dryRun;
    }

    /**
     * Read a file
     */
    async readFile(filePath: string): Promise<string | null> {
        try {
            const fullPath = path.join(this.workingDir, filePath);
            return await fs.readFile(fullPath, 'utf-8');
        } catch {
            return null;
        }
    }

    /**
     * Write a file (with backup for rollback)
     */
    async writeFile(filePath: string, content: string): Promise<FileChange> {
        const fullPath = path.join(this.workingDir, filePath);
        const originalContent = await this.readFile(filePath);

        const change: FileChange = {
            path: filePath,
            action: originalContent ? 'modify' : 'create',
            content,
            originalContent: originalContent ?? undefined,
        };

        if (!this.dryRun) {
            // Ensure directory exists
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf-8');
        }

        console.log(`📝 ${change.action.toUpperCase()}: ${filePath}`);
        return change;
    }

    /**
     * Delete a file (with backup for rollback)
     */
    async deleteFile(filePath: string): Promise<FileChange> {
        const originalContent = await this.readFile(filePath);

        const change: FileChange = {
            path: filePath,
            action: 'delete',
            originalContent: originalContent ?? undefined,
        };

        if (!this.dryRun && originalContent) {
            const fullPath = path.join(this.workingDir, filePath);
            await fs.unlink(fullPath);
        }

        console.log(`🗑️ DELETE: ${filePath}`);
        return change;
    }

    /**
     * Execute a batch of changes
     */
    async executeChanges(changes: Array<{
        action: 'create' | 'modify' | 'delete';
        path: string;
        content?: string;
    }>): Promise<ExecutionResult> {
        const executedChanges: FileChange[] = [];

        try {
            for (const change of changes) {
                if (change.action === 'delete') {
                    executedChanges.push(await this.deleteFile(change.path));
                } else {
                    if (!change.content) {
                        throw new Error(`Missing content for ${change.action} on ${change.path}`);
                    }
                    executedChanges.push(await this.writeFile(change.path, change.content));
                }
            }

            // Save to history for rollback
            this.changeHistory.push(executedChanges);

            return {
                success: true,
                changes: executedChanges,
            };
        } catch (error) {
            return {
                success: false,
                changes: executedChanges,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Run a shell command
     */
    async runCommand(command: string, args: string[] = []): Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
    }> {
        return new Promise((resolve) => {
            if (this.dryRun) {
                console.log(`🔧 [DRY RUN] Would execute: ${command} ${args.join(' ')}`);
                resolve({ exitCode: 0, stdout: '[dry run]', stderr: '' });
                return;
            }

            const proc = spawn(command, args, {
                cwd: this.workingDir,
                shell: true,
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                resolve({
                    exitCode: code ?? 1,
                    stdout,
                    stderr,
                });
            });

            proc.on('error', (err) => {
                resolve({
                    exitCode: 1,
                    stdout,
                    stderr: err.message,
                });
            });
        });
    }

    /**
     * Run tests
     */
    async runTests(testCommand = 'npm test'): Promise<TestResult> {
        console.log('🧪 Running tests...');

        const [cmd, ...args] = testCommand.split(' ');
        const result = await this.runCommand(cmd!, args);

        const output = result.stdout + result.stderr;
        const passed = result.exitCode === 0;

        // Parse errors from output (simplified)
        const errors: TestError[] = [];
        if (!passed) {
            const errorMatches = output.matchAll(/Error: (.+?)(?:\n|$)/g);
            for (const match of errorMatches) {
                errors.push({
                    file: 'unknown',
                    message: match[1] ?? 'Unknown error',
                });
            }
        }

        // Parse test counts (simplified - works with common test runners)
        const countMatch = output.match(/(\d+) passed.*?(\d+) failed/i) ||
            output.match(/Tests:\s*(\d+) passed,\s*(\d+) failed/i);

        const passedTests = countMatch ? parseInt(countMatch[1]!) : (passed ? 1 : 0);
        const failedTests = countMatch ? parseInt(countMatch[2]!) : (passed ? 0 : 1);

        const testResult: TestResult = {
            passed,
            totalTests: passedTests + failedTests,
            passedTests,
            failedTests,
            errors,
            output,
        };

        console.log(passed
            ? `✅ Tests passed (${passedTests}/${testResult.totalTests})`
            : `❌ Tests failed (${failedTests} failures)`
        );

        return testResult;
    }

    /**
     * Rollback last batch of changes
     */
    async rollback(): Promise<boolean> {
        const lastBatch = this.changeHistory.pop();
        if (!lastBatch) {
            console.log('⚠️ Nothing to rollback');
            return false;
        }

        console.log('⏪ Rolling back changes...');

        for (const change of lastBatch.reverse()) {
            const fullPath = path.join(this.workingDir, change.path);

            if (change.action === 'create') {
                // Delete the created file
                if (!this.dryRun) {
                    await fs.unlink(fullPath).catch(() => { });
                }
                console.log(`  ⏪ Deleted: ${change.path}`);
            } else if (change.action === 'modify' && change.originalContent) {
                // Restore original content
                if (!this.dryRun) {
                    await fs.writeFile(fullPath, change.originalContent, 'utf-8');
                }
                console.log(`  ⏪ Restored: ${change.path}`);
            } else if (change.action === 'delete' && change.originalContent) {
                // Recreate deleted file
                if (!this.dryRun) {
                    await fs.writeFile(fullPath, change.originalContent, 'utf-8');
                }
                console.log(`  ⏪ Recreated: ${change.path}`);
            }
        }

        console.log('✅ Rollback complete');
        return true;
    }

    /**
     * Get file tree of working directory
     */
    async getFileTree(maxDepth = 3): Promise<string> {
        const tree: string[] = [];

        async function walk(dir: string, prefix: string, depth: number) {
            if (depth > maxDepth) return;

            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                const filtered = entries.filter(e =>
                    !e.name.startsWith('.') &&
                    e.name !== 'node_modules' &&
                    e.name !== 'dist'
                );

                for (let i = 0; i < filtered.length; i++) {
                    const entry = filtered[i]!;
                    const isLast = i === filtered.length - 1;
                    const connector = isLast ? '└── ' : '├── ';
                    const newPrefix = prefix + (isLast ? '    ' : '│   ');

                    tree.push(`${prefix}${connector}${entry.name}`);

                    if (entry.isDirectory()) {
                        await walk(path.join(dir, entry.name), newPrefix, depth + 1);
                    }
                }
            } catch {
                // Ignore errors
            }
        }

        await walk(this.workingDir, '', 0);
        return tree.join('\n');
    }
}
