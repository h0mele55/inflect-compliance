/**
 * Vendor Enrichment Provider Interface + Test Implementation
 *
 * Clean interface for swapping real enrichment later (Clearbit, etc.).
 * TestModeProvider returns deterministic data for CI-safe tests.
 */

export interface EnrichmentResult {
    companyName?: string;
    country?: string;
    privacyPolicyUrl?: string;
    securityPageUrl?: string;
    certifications?: string[];
    description?: string;
}

export interface EnrichmentProvider {
    name: string;
    enrich(domain: string): Promise<EnrichmentResult>;
}

/**
 * Deterministic test provider — always returns predictable data based on domain hash.
 */
export class TestModeEnrichmentProvider implements EnrichmentProvider {
    name = 'TEST_MODE';

    async enrich(domain: string): Promise<EnrichmentResult> {
        const hash = simpleHash(domain);
        const hasSoc2 = hash % 3 !== 0;
        const hasIso = hash % 2 === 0;

        return {
            companyName: `${capitalize(domain.split('.')[0])} Inc.`,
            country: ['US', 'UK', 'DE', 'JP', 'AU'][hash % 5],
            privacyPolicyUrl: `https://${domain}/privacy`,
            securityPageUrl: `https://${domain}/security`,
            certifications: [
                ...(hasSoc2 ? ['SOC2'] : []),
                ...(hasIso ? ['ISO27001'] : []),
            ],
            description: `${capitalize(domain.split('.')[0])} provides enterprise services.`,
        };
    }
}

/**
 * Simple HTML metadata fetch provider — extracts basic info from homepage.
 * No heavy scraping — just meta tags & known paths.
 */
export class SimpleMetadataProvider implements EnrichmentProvider {
    name = 'SIMPLE_METADATA';

    async enrich(domain: string): Promise<EnrichmentResult> {
        const result: EnrichmentResult = {};
        try {
            const res = await fetch(`https://${domain}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VendorEnrichment/1.0)' },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return result;

            const html = await res.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) result.companyName = titleMatch[1].trim().split(/[|\-–]/)[0].trim();

            const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
            if (descMatch) result.description = descMatch[1].trim().substring(0, 500);

            // Check known privacy/security paths
            for (const path of ['/privacy', '/privacy-policy', '/legal/privacy']) {
                try {
                    const pr = await fetch(`https://${domain}${path}`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
                    if (pr.ok) { result.privacyPolicyUrl = `https://${domain}${path}`; break; }
                } catch { /* skip */ }
            }
            for (const path of ['/security', '/trust', '/trust-center']) {
                try {
                    const sr = await fetch(`https://${domain}${path}`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
                    if (sr.ok) { result.securityPageUrl = `https://${domain}${path}`; break; }
                } catch { /* skip */ }
            }
        } catch { /* network error, return empty */ }
        return result;
    }
}

/**
 * Get the appropriate enrichment provider.
 * Default to test mode. Pass providerName explicitly for real providers.
 */
export function getEnrichmentProvider(providerName?: string): EnrichmentProvider {
    if (providerName === 'SIMPLE_METADATA') {
        return new SimpleMetadataProvider();
    }
    // Default to test mode for safety (no process.env reference)
    return new TestModeEnrichmentProvider();
}

function simpleHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
