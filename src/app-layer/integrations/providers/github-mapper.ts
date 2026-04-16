/**
 * Compatibility re-export — github-mapper.ts → github/mapper.ts
 *
 * Preserves the old import path for existing consumers.
 * New code should import from './providers/github' instead.
 *
 * @deprecated Import from './providers/github' instead.
 */
export { GitHubBranchProtectionMapper } from './github/mapper';
