import { classifyDueDate } from '../../src/app-layer/services/vendor-renewals';
import { TestModeEnrichmentProvider } from '../../src/app-layer/services/vendor-enrichment';

describe('Vendor Renewals - classifyDueDate', () => {
    it('returns "none" for null', () => {
        expect(classifyDueDate(null)).toBe('none');
    });

    it('returns "overdue" for past date', () => {
        const past = new Date(Date.now() - 86400000).toISOString();
        expect(classifyDueDate(past)).toBe('overdue');
    });

    it('returns "due-soon" for date within 30 days', () => {
        const soon = new Date(Date.now() + 15 * 86400000).toISOString();
        expect(classifyDueDate(soon)).toBe('due-soon');
    });

    it('returns "ok" for date beyond 30 days', () => {
        const far = new Date(Date.now() + 60 * 86400000).toISOString();
        expect(classifyDueDate(far)).toBe('ok');
    });

    it('uses custom threshold', () => {
        const in45 = new Date(Date.now() + 45 * 86400000).toISOString();
        expect(classifyDueDate(in45, 30)).toBe('ok');
        expect(classifyDueDate(in45, 60)).toBe('due-soon');
    });

    it('handles Date objects', () => {
        const past = new Date(Date.now() - 1000);
        expect(classifyDueDate(past)).toBe('overdue');
    });
});

describe('Vendor Enrichment - TestModeProvider', () => {
    const provider = new TestModeEnrichmentProvider();

    it('has name TEST_MODE', () => {
        expect(provider.name).toBe('TEST_MODE');
    });

    it('returns deterministic results for same domain', async () => {
        const r1 = await provider.enrich('example.com');
        const r2 = await provider.enrich('example.com');
        expect(r1).toEqual(r2);
    });

    it('returns company name based on domain', async () => {
        const r = await provider.enrich('acme.com');
        expect(r.companyName).toBe('Acme Inc.');
    });

    it('returns privacy and security URLs', async () => {
        const r = await provider.enrich('test.com');
        expect(r.privacyPolicyUrl).toBe('https://test.com/privacy');
        expect(r.securityPageUrl).toBe('https://test.com/security');
    });

    it('returns country from deterministic list', async () => {
        const r = await provider.enrich('foo.com');
        expect(['US', 'UK', 'DE', 'JP', 'AU']).toContain(r.country);
    });

    it('returns certifications array', async () => {
        const r = await provider.enrich('bar.com');
        expect(Array.isArray(r.certifications)).toBe(true);
        for (const c of r.certifications!) {
            expect(['SOC2', 'ISO27001']).toContain(c);
        }
    });

    it('different domains produce different results', async () => {
        const r1 = await provider.enrich('alpha.com');
        const r2 = await provider.enrich('beta.com');
        // At least the company name should differ
        expect(r1.companyName).not.toBe(r2.companyName);
    });
});
