/**
 * Integration Provider Bootstrap
 *
 * Registers all available integration providers with the global registry.
 * Import this module once at application startup to enable all providers.
 *
 * Usage:
 *   import '@/app-layer/integrations/bootstrap';
 *
 * @module integrations/bootstrap
 */
import { registry } from './registry';
import { GitHubProvider } from './providers/github';

// ─── Register Providers ──────────────────────────────────────────────

// GitHub — branch protection, repo security
registry.register(new GitHubProvider());

// Future providers:
// registry.register(new AwsProvider());
// registry.register(new AzureProvider());
// registry.register(new GitLabProvider());
