/**
 * Compatibility re-export — github-client.ts → github/client.ts
 *
 * Preserves the old import path for existing consumers.
 * New code should import from './providers/github' instead.
 *
 * @deprecated Import from './providers/github' instead.
 */
export { GitHubClient, type GitHubConnectionConfig } from './github/client';
