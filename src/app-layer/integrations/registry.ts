/**
 * Integration Provider Registry
 *
 * Central registry that maps provider IDs to their implementations.
 * Used to route automationKey prefixes to the correct provider.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   import { registry } from '@/app-layer/integrations/registry';
 *
 *   // Register a provider
 *   registry.register(new GitHubProvider());
 *
 *   // Lookup by automationKey
 *   const provider = registry.resolveByAutomationKey('github.branch_protection');
 *   // → GitHubProvider instance
 *
 *   // List all registered providers
 *   const all = registry.listProviders();
 *
 * @module integrations/registry
 */
import type {
    IntegrationProvider,
    ScheduledCheckProvider,
    WebhookEventProvider,
    ParsedAutomationKey,
} from './types';
import {
    parseAutomationKey,
    isScheduledCheckProvider,
    isWebhookEventProvider,
} from './types';
import { logger } from '@/lib/observability/logger';

// ─── Registry Implementation ─────────────────────────────────────────

class ProviderRegistry {
    private readonly providers = new Map<string, IntegrationProvider>();

    /**
     * Register a provider. Overwrites any existing provider with the same ID.
     */
    register(provider: IntegrationProvider): void {
        if (!provider.id || typeof provider.id !== 'string') {
            throw new Error('Provider must have a non-empty string id');
        }
        this.providers.set(provider.id, provider);
        logger.info('Integration provider registered', {
            component: 'integrations',
            provider: provider.id,
            checks: provider.supportedChecks,
        });
    }

    /**
     * Unregister a provider by ID.
     */
    unregister(providerId: string): boolean {
        return this.providers.delete(providerId);
    }

    /**
     * Get a provider by its ID.
     */
    getProvider(providerId: string): IntegrationProvider | undefined {
        return this.providers.get(providerId);
    }

    /**
     * Resolve a provider from an automationKey.
     * Parses the key, extracts the provider prefix, and looks it up.
     *
     * @returns The provider and parsed key, or null if not found.
     */
    resolveByAutomationKey(automationKey: string): {
        provider: IntegrationProvider;
        parsed: ParsedAutomationKey;
    } | null {
        const parsed = parseAutomationKey(automationKey);
        if (!parsed) return null;

        const provider = this.providers.get(parsed.provider);
        if (!provider) return null;

        // Verify the provider supports this check type
        if (!provider.supportedChecks.includes(parsed.checkType)) {
            logger.warn('Provider does not support check type', {
                component: 'integrations',
                provider: parsed.provider,
                checkType: parsed.checkType,
                supported: provider.supportedChecks,
            });
            return null;
        }

        return { provider, parsed };
    }

    /**
     * Find a provider that handles webhooks for this provider ID.
     */
    getWebhookProvider(providerId: string): WebhookEventProvider | null {
        const provider = this.providers.get(providerId);
        if (!provider) return null;
        return isWebhookEventProvider(provider) ? provider : null;
    }

    /**
     * Find a provider that supports scheduled checks for this provider ID.
     */
    getScheduledProvider(providerId: string): ScheduledCheckProvider | null {
        const provider = this.providers.get(providerId);
        if (!provider) return null;
        return isScheduledCheckProvider(provider) ? provider : null;
    }

    /**
     * List all registered providers.
     */
    listProviders(): IntegrationProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * List all registered provider IDs.
     */
    listProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * List all supported automationKeys across all providers.
     */
    listAllAutomationKeys(): string[] {
        const keys: string[] = [];
        for (const [id, provider] of this.providers) {
            for (const check of provider.supportedChecks) {
                keys.push(`${id}.${check}`);
            }
        }
        return keys;
    }

    /**
     * Check if any provider is registered for the given automationKey.
     */
    canHandle(automationKey: string): boolean {
        return this.resolveByAutomationKey(automationKey) !== null;
    }

    /**
     * Clear all providers. Used in tests.
     * @internal
     */
    _clear(): void {
        this.providers.clear();
    }
}

/**
 * Global singleton provider registry.
 * Import and use this across the application.
 */
export const registry = new ProviderRegistry();
