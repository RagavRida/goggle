/**
 * Reasoning Engine for Dev Teammate
 * 
 * Uses Gemini for:
 * - Analyzing GitHub issues
 * - Planning code changes
 * - Diagnosing test failures
 * - Suggesting fixes
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// Types
// ============================================================================

export interface Issue {
    id: string;
    title: string;
    body: string;
    labels?: string[];
}

export interface CodeContext {
    files: Map<string, string>;  // path -> content
    structure: string;           // File tree
}

export interface RefactorPlan {
    summary: string;
    steps: PlanStep[];
    affectedFiles: string[];
    risks: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface PlanStep {
    order: number;
    action: 'create' | 'modify' | 'delete' | 'rename';
    file: string;
    description: string;
    code?: string;
}

export interface ErrorAnalysis {
    errorType: string;
    rootCause: string;
    affectedFile: string;
    suggestedFix: string;
    confidence: number;
}

// ============================================================================
// Reasoning Engine
// ============================================================================

export class ReasoningEngine {
    private genAI: GoogleGenerativeAI;
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    }

    /**
     * Analyze a GitHub issue to extract intent and requirements
     */
    async analyzeIssue(issue: Issue): Promise<{
        intent: string;
        scope: string;
        requirements: string[];
        suggestedApproach: string;
    }> {
        const prompt = `Analyze this GitHub issue and extract structured information.

ISSUE TITLE: ${issue.title}
ISSUE BODY: ${issue.body}
LABELS: ${issue.labels?.join(', ') || 'none'}

Respond in this exact JSON format:
{
  "intent": "Brief description of what the user wants",
  "scope": "Which part of the codebase (e.g., 'auth', 'database', 'api')",
  "requirements": ["List", "of", "specific", "requirements"],
  "suggestedApproach": "High-level approach to solve this"
}`;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();

            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error analyzing issue:', error);
        }

        // Fallback
        return {
            intent: issue.title,
            scope: 'general',
            requirements: [issue.body],
            suggestedApproach: 'Review and implement the requested changes',
        };
    }

    /**
     * Plan a refactor with constraints
     */
    async planRefactor(
        issue: Issue,
        context: CodeContext,
        constraints: string
    ): Promise<RefactorPlan> {
        const prompt = `You are a senior developer planning a code refactor.

TASK: ${issue.title}
DETAILS: ${issue.body}

CODEBASE STRUCTURE:
${context.structure}

CONSTRAINTS (MUST RESPECT):
${constraints}

Plan the refactor. Respond in this JSON format:
{
  "summary": "Brief summary of the plan",
  "steps": [
    {
      "order": 1,
      "action": "modify",
      "file": "path/to/file.ts",
      "description": "What to change"
    }
  ],
  "affectedFiles": ["list", "of", "files"],
  "risks": ["potential", "issues"],
  "estimatedComplexity": "low|medium|high"
}

IMPORTANT: Do NOT modify any files mentioned in the constraints as protected.`;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error planning refactor:', error);
        }

        // Fallback plan
        return {
            summary: `Implement: ${issue.title}`,
            steps: [],
            affectedFiles: [],
            risks: ['Unable to generate detailed plan'],
            estimatedComplexity: 'high',
        };
    }

    /**
     * Analyze a test error and suggest fix
     */
    async analyzeError(
        error: string,
        context: { file: string; code: string }
    ): Promise<ErrorAnalysis> {
        const prompt = `Analyze this test error and suggest a fix.

ERROR:
${error}

FILE: ${context.file}
CODE:
${context.code}

Respond in JSON format:
{
  "errorType": "Type of error (e.g., 'TypeError', 'SyntaxError')",
  "rootCause": "Why this error occurred",
  "affectedFile": "Which file to fix",
  "suggestedFix": "Specific code change to fix it",
  "confidence": 0.0-1.0
}`;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error('Error analyzing error:', error);
        }

        return {
            errorType: 'Unknown',
            rootCause: 'Could not determine root cause',
            affectedFile: context.file,
            suggestedFix: 'Manual review required',
            confidence: 0.1,
        };
    }

    /**
     * Generate code for a plan step
     */
    async generateCode(
        step: PlanStep,
        existingCode: string | null,
        context: string
    ): Promise<string> {
        const prompt = `Generate code for this task.

TASK: ${step.description}
FILE: ${step.file}
ACTION: ${step.action}

${existingCode ? `EXISTING CODE:\n${existingCode}` : 'This is a new file.'}

CONTEXT:
${context}

Respond with ONLY the code, no explanations.`;

        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('Error generating code:', error);
            return existingCode || '// Code generation failed';
        }
    }
}
