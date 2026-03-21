/**
 * AI Risk Assessment — Provider Factory
 *
 * Returns the appropriate provider based on environment configuration.
 * Default: stub (no API key needed).
 * Set AI_RISK_PROVIDER=openrouter + OPENROUTER_API_KEY for real LLM.
 *
 * If the configured provider fails, each provider handles its own fallback
 * to the deterministic knowledge-base templates.
 */
import type { RiskSuggestionProvider } from './types';
import { StubRiskSuggestionProvider } from './stub-provider';
import { OpenRouterRiskSuggestionProvider } from './openrouter-provider';
import { env } from '@/env';

export function getProvider(): RiskSuggestionProvider {
    const providerName = env.AI_RISK_PROVIDER?.toLowerCase() ?? 'stub';

    switch (providerName) {
        case 'openrouter': {
            const apiKey = env.OPENROUTER_API_KEY;
            if (!apiKey) {
                console.warn('[AI Risk] OPENROUTER_API_KEY not set, falling back to baseline template provider');
                return new StubRiskSuggestionProvider(/* isFallbackMode */ true);
            }
            const model = env.OPENROUTER_MODEL ?? undefined;
            return new OpenRouterRiskSuggestionProvider(apiKey, model);
        }
        default:
            return new StubRiskSuggestionProvider();
    }
}

// Re-export types for convenience
export type { RiskSuggestionProvider, RiskAssessmentInput, RiskSuggestionOutput } from './types';
