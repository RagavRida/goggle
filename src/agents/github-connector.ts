/**
 * GitHub Connector Agent
 * 
 * Wraps Octokit to provide GitHub capabilities to ContextOS.
 * Can be registered as an agent to handle tasks found by the kernel.
 */

import { Octokit } from '@octokit/rest';
import { Result, ok, err } from '../types/index.js';

export interface GitHubConfig {
    token: string;
    owner?: string;
    repo?: string;
}

export interface Issue {
    number: number;
    title: string;
    body: string;
    state: string;
    url: string;
}

export class GitHubConnector {
    private octokit: Octokit;
    private owner?: string;
    private repo?: string;

    constructor(config: GitHubConfig) {
        this.octokit = new Octokit({ auth: config.token });
        this.owner = config.owner;
        this.repo = config.repo;
    }

    /**
     * Check authentication status
     */
    async whoami(): Promise<Result<string>> {
        try {
            const { data } = await this.octokit.users.getAuthenticated();
            return ok(data.login);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * List issues for configured repo or specific one
     */
    async listIssues(options?: { owner?: string; repo?: string; state?: 'open' | 'closed' | 'all' }): Promise<Result<Issue[]>> {
        try {
            const owner = options?.owner ?? this.owner;
            const repo = options?.repo ?? this.repo;

            if (!owner || !repo) {
                return err(new Error('Owner and repo must be provided via config or arguments'));
            }

            const { data } = await this.octokit.issues.listForRepo({
                owner,
                repo,
                state: options?.state ?? 'open',
            });

            const issues: Issue[] = data.map(i => ({
                number: i.number,
                title: i.title,
                body: i.body ?? '',
                state: i.state,
                url: i.html_url,
            }));

            return ok(issues);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Get a specific issue
     */
    async getIssue(number: number, options?: { owner?: string; repo?: string }): Promise<Result<Issue>> {
        try {
            const owner = options?.owner ?? this.owner;
            const repo = options?.repo ?? this.repo;

            if (!owner || !repo) {
                return err(new Error('Owner and repo must be provided via config or arguments'));
            }

            const { data } = await this.octokit.issues.get({
                owner,
                repo,
                issue_number: number,
            });

            return ok({
                number: data.number,
                title: data.title,
                body: data.body ?? '',
                state: data.state,
                url: data.html_url,
            });
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Create a comment on an issue
     */
    async comment(number: number, body: string, options?: { owner?: string; repo?: string }): Promise<Result<string>> {
        try {
            const owner = options?.owner ?? this.owner;
            const repo = options?.repo ?? this.repo;

            if (!owner || !repo) {
                return err(new Error('Owner and repo must be provided via config or arguments'));
            }

            const { data } = await this.octokit.issues.createComment({
                owner,
                repo,
                issue_number: number,
                body,
            });

            return ok(data.html_url);
        } catch (error) {
            return err(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
