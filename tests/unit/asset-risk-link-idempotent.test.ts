/**
 * AssetRiskLink — re-linking the same (asset, risk) pair must be
 * idempotent. Previously the repository called `db.assetRiskLink.create`
 * directly; the unique-constraint hit translated to a P2002 → 409
 * Conflict, surfaced as a confusing failure on the asset detail UI.
 *
 * The repo now upserts; this test pins that behavior so a future
 * refactor doesn't silently revert the shape.
 */
import { AssetRiskRepository } from '@/app-layer/repositories/TraceabilityRepository';

describe('AssetRiskRepository.link — idempotent', () => {
    it('uses upsert keyed on the composite unique', async () => {
        const upsert = jest.fn().mockResolvedValue({ id: 'edge-1' });
        const db = { assetRiskLink: { upsert } } as never;
        await AssetRiskRepository.link(
            db,
            'tenant-1',
            'asset-1',
            'risk-1',
            'HIGH',
            'because',
            'user-1',
        );
        expect(upsert).toHaveBeenCalledTimes(1);
        const arg = upsert.mock.calls[0][0];
        expect(arg.where.tenantId_assetId_riskId).toEqual({
            tenantId: 'tenant-1',
            assetId: 'asset-1',
            riskId: 'risk-1',
        });
        expect(arg.create).toMatchObject({
            tenantId: 'tenant-1',
            assetId: 'asset-1',
            riskId: 'risk-1',
            exposureLevel: 'HIGH',
            rationale: 'because',
            createdByUserId: 'user-1',
        });
        expect(arg.update).toMatchObject({
            exposureLevel: 'HIGH',
            rationale: 'because',
        });
    });

    it('re-link without exposureLevel leaves the existing edge alone', async () => {
        const upsert = jest.fn().mockResolvedValue({ id: 'edge-1' });
        const db = { assetRiskLink: { upsert } } as never;
        await AssetRiskRepository.link(
            db,
            'tenant-1',
            'asset-1',
            'risk-1',
            null,
            null,
            'user-1',
        );
        const arg = upsert.mock.calls[0][0];
        // create-side falls back to MEDIUM as before; update-side is
        // a no-op so the existing edge keeps its prior level.
        expect(arg.create.exposureLevel).toBe('MEDIUM');
        expect(arg.update).toEqual({});
    });
});
