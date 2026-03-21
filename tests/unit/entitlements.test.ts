/**
 * Entitlement mapping unit tests.
 * Tests feature-to-plan gating logic — no DB required.
 */

// Import entitlement functions directly (they're pure functions)
// We need to mock the prisma import since it's used by getTenantPlan
jest.mock('@/lib/prisma', () => ({}));

import { hasFeature, getAvailableFeatures, getRequiredPlan, FEATURES } from '@/lib/entitlements';

describe('Entitlements', () => {
    describe('hasFeature', () => {
        test('FREE plan has no premium features', () => {
            expect(hasFeature('FREE', FEATURES.PDF_EXPORTS)).toBe(false);
            expect(hasFeature('FREE', FEATURES.AUDIT_PACK_SHARING)).toBe(false);
            expect(hasFeature('FREE', FEATURES.ADVANCED_VENDOR_MGMT)).toBe(false);
            expect(hasFeature('FREE', FEATURES.CUSTOM_INTEGRATIONS)).toBe(false);
        });

        test('TRIAL plan has PDF_EXPORTS only', () => {
            expect(hasFeature('TRIAL', FEATURES.PDF_EXPORTS)).toBe(true);
            expect(hasFeature('TRIAL', FEATURES.AUDIT_PACK_SHARING)).toBe(false);
            expect(hasFeature('TRIAL', FEATURES.ADVANCED_VENDOR_MGMT)).toBe(false);
            expect(hasFeature('TRIAL', FEATURES.CUSTOM_INTEGRATIONS)).toBe(false);
        });

        test('PRO plan has PDF + sharing + vendor but not integrations', () => {
            expect(hasFeature('PRO', FEATURES.PDF_EXPORTS)).toBe(true);
            expect(hasFeature('PRO', FEATURES.AUDIT_PACK_SHARING)).toBe(true);
            expect(hasFeature('PRO', FEATURES.ADVANCED_VENDOR_MGMT)).toBe(true);
            expect(hasFeature('PRO', FEATURES.CUSTOM_INTEGRATIONS)).toBe(false);
        });

        test('ENTERPRISE plan has all features', () => {
            expect(hasFeature('ENTERPRISE', FEATURES.PDF_EXPORTS)).toBe(true);
            expect(hasFeature('ENTERPRISE', FEATURES.AUDIT_PACK_SHARING)).toBe(true);
            expect(hasFeature('ENTERPRISE', FEATURES.ADVANCED_VENDOR_MGMT)).toBe(true);
            expect(hasFeature('ENTERPRISE', FEATURES.CUSTOM_INTEGRATIONS)).toBe(true);
        });

        test('unknown plan defaults to no features', () => {
            expect(hasFeature('UNKNOWN', FEATURES.PDF_EXPORTS)).toBe(false);
        });
    });

    describe('getAvailableFeatures', () => {
        test('FREE has 0 features', () => {
            expect(getAvailableFeatures('FREE')).toHaveLength(0);
        });

        test('TRIAL has 1 feature', () => {
            expect(getAvailableFeatures('TRIAL')).toHaveLength(1);
            expect(getAvailableFeatures('TRIAL')).toContain('PDF_EXPORTS');
        });

        test('PRO has 3 features', () => {
            expect(getAvailableFeatures('PRO')).toHaveLength(3);
        });

        test('ENTERPRISE has 4 features', () => {
            expect(getAvailableFeatures('ENTERPRISE')).toHaveLength(4);
        });
    });

    describe('getRequiredPlan', () => {
        test('PDF_EXPORTS requires TRIAL', () => {
            expect(getRequiredPlan(FEATURES.PDF_EXPORTS)).toBe('TRIAL');
        });

        test('AUDIT_PACK_SHARING requires PRO', () => {
            expect(getRequiredPlan(FEATURES.AUDIT_PACK_SHARING)).toBe('PRO');
        });

        test('CUSTOM_INTEGRATIONS requires ENTERPRISE', () => {
            expect(getRequiredPlan(FEATURES.CUSTOM_INTEGRATIONS)).toBe('ENTERPRISE');
        });
    });
});
