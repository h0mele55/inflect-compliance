import { RequestContext } from '../types';
import { ControlRiskRepository, AssetControlRepository, AssetRiskRepository } from '../repositories/TraceabilityRepository';
import { logEvent } from '../events/audit';
import { forbidden } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';

function assertCanRead(ctx: RequestContext) {
    // All roles can read traceability
}

function assertCanManage(ctx: RequestContext) {
    if (ctx.role !== 'ADMIN' && ctx.role !== 'EDITOR') throw forbidden('Only ADMIN or EDITOR can manage mappings');
}

// ─── Control ↔ Risk ───

export async function listControlRisks(ctx: RequestContext, controlId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => ControlRiskRepository.listByControl(db, ctx.tenantId, controlId));
}

export async function listRiskControls(ctx: RequestContext, riskId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => ControlRiskRepository.listByRisk(db, ctx.tenantId, riskId));
}

export async function mapControlToRisk(ctx: RequestContext, controlId: string, riskId: string, rationale?: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await ControlRiskRepository.link(db, ctx.tenantId, controlId, riskId, rationale || null, ctx.userId);
        await logEvent(db, ctx, { action: 'CONTROL_RISK_LINKED', entityType: 'Control', entityId: controlId, details: `Linked to risk ${riskId}`, metadata: { riskId, rationale } });
        return link;
    });
}

export async function unmapControlFromRisk(ctx: RequestContext, controlId: string, riskId: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        await ControlRiskRepository.unlink(db, ctx.tenantId, controlId, riskId);
        await logEvent(db, ctx, { action: 'CONTROL_RISK_UNLINKED', entityType: 'Control', entityId: controlId, details: `Unlinked from risk ${riskId}`, metadata: { riskId } });
    });
}

// ─── Asset ↔ Control ───

export async function listAssetControls(ctx: RequestContext, assetId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => AssetControlRepository.listByAsset(db, ctx.tenantId, assetId));
}

export async function listControlAssets(ctx: RequestContext, controlId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => AssetControlRepository.listByControl(db, ctx.tenantId, controlId));
}

export async function mapAssetToControl(ctx: RequestContext, assetId: string, controlId: string, coverageType?: string, rationale?: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await AssetControlRepository.link(db, ctx.tenantId, assetId, controlId, coverageType || null, rationale || null, ctx.userId);
        await logEvent(db, ctx, { action: 'ASSET_CONTROL_LINKED', entityType: 'Asset', entityId: assetId, details: `Linked to control ${controlId}`, metadata: { controlId, coverageType } });
        return link;
    });
}

export async function unmapAssetFromControl(ctx: RequestContext, assetId: string, controlId: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        await AssetControlRepository.unlink(db, ctx.tenantId, assetId, controlId);
        await logEvent(db, ctx, { action: 'ASSET_CONTROL_UNLINKED', entityType: 'Asset', entityId: assetId, details: `Unlinked from control ${controlId}`, metadata: { controlId } });
    });
}

// ─── Asset ↔ Risk ───

export async function listAssetRisks(ctx: RequestContext, assetId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => AssetRiskRepository.listByAsset(db, ctx.tenantId, assetId));
}

export async function listRiskAssets(ctx: RequestContext, riskId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) => AssetRiskRepository.listByRisk(db, ctx.tenantId, riskId));
}

export async function mapAssetToRisk(ctx: RequestContext, assetId: string, riskId: string, exposureLevel?: string, rationale?: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        const link = await AssetRiskRepository.link(db, ctx.tenantId, assetId, riskId, exposureLevel || null, rationale || null, ctx.userId);
        await logEvent(db, ctx, { action: 'ASSET_RISK_LINKED', entityType: 'Asset', entityId: assetId, details: `Linked to risk ${riskId}`, metadata: { riskId, exposureLevel } });
        return link;
    });
}

export async function unmapAssetFromRisk(ctx: RequestContext, assetId: string, riskId: string) {
    assertCanManage(ctx);
    return runInTenantContext(ctx, async (db) => {
        await AssetRiskRepository.unlink(db, ctx.tenantId, assetId, riskId);
        await logEvent(db, ctx, { action: 'ASSET_RISK_UNLINKED', entityType: 'Asset', entityId: assetId, details: `Unlinked from risk ${riskId}`, metadata: { riskId } });
    });
}

// ─── Traceability Views ───

export async function getControlTraceability(ctx: RequestContext, controlId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const [risks, assets] = await Promise.all([
            ControlRiskRepository.listByControl(db, ctx.tenantId, controlId),
            AssetControlRepository.listByControl(db, ctx.tenantId, controlId),
        ]);
        return { controlId, risks, assets };
    });
}

export async function getRiskTraceability(ctx: RequestContext, riskId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const [controls, assets] = await Promise.all([
            ControlRiskRepository.listByRisk(db, ctx.tenantId, riskId),
            AssetRiskRepository.listByRisk(db, ctx.tenantId, riskId),
        ]);
        return { riskId, controls, assets };
    });
}

export async function getAssetTraceability(ctx: RequestContext, assetId: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const [controls, risks] = await Promise.all([
            AssetControlRepository.listByAsset(db, ctx.tenantId, assetId),
            AssetRiskRepository.listByAsset(db, ctx.tenantId, assetId),
        ]);
        return { assetId, controls, risks };
    });
}

// ─── Coverage Summary ───

export async function coverageSummary(ctx: RequestContext) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const t = ctx.tenantId;

        // Total counts
        const [totalRisks, totalControls, totalAssets] = await Promise.all([
            db.risk.count({ where: { tenantId: t } }),
            db.control.count({ where: { tenantId: t } }),
            db.asset.count({ where: { tenantId: t, status: 'ACTIVE' } }),
        ]);

        // Mapped counts (distinct)
        const [risksWithControls, controlsWithRisks, assetsWithControls] = await Promise.all([
            db.riskControl.findMany({ where: { tenantId: t }, select: { riskId: true }, distinct: ['riskId'] }),
            db.riskControl.findMany({ where: { tenantId: t }, select: { controlId: true }, distinct: ['controlId'] }),
            db.controlAsset.findMany({ where: { tenantId: t }, select: { assetId: true }, distinct: ['assetId'] }),
        ]);

        const risksWithControlsCount = risksWithControls.length;
        const controlsWithRisksCount = controlsWithRisks.length;
        const assetsWithControlsCount = assetsWithControls.length;

        // Unmapped risks (no controls)
        const mappedRiskIds = new Set(risksWithControls.map(r => r.riskId));
        const unmappedRisks = await db.risk.findMany({
            where: { tenantId: t, id: { notIn: Array.from(mappedRiskIds) } },
            select: { id: true, title: true, score: true, status: true },
            orderBy: { score: 'desc' },
            take: 10,
        });

        // Critical assets with no controls
        const mappedAssetIds = new Set(assetsWithControls.map(a => a.assetId));
        const uncoveredCriticalAssets = await db.asset.findMany({
            where: { tenantId: t, status: 'ACTIVE', criticality: 'HIGH', id: { notIn: Array.from(mappedAssetIds) } },
            select: { id: true, name: true, type: true, criticality: true },
            take: 10,
        });

        // Hot controls (most risks)
        const hotControls = await db.riskControl.groupBy({
            by: ['controlId'],
            where: { tenantId: t },
            _count: { riskId: true },
            orderBy: { _count: { riskId: 'desc' } },
            take: 5,
        });
        const hotControlDetails = hotControls.length > 0 ? await db.control.findMany({
            where: { id: { in: hotControls.map(h => h.controlId) } },
            select: { id: true, code: true, name: true },
        }) : [];
        const hotControlsResult = hotControls.map(h => ({
            ...hotControlDetails.find(c => c.id === h.controlId),
            riskCount: h._count.riskId,
        }));

        return {
            totalRisks,
            totalControls,
            totalAssets,
            risksWithControlsCount,
            risksWithControlsPct: totalRisks > 0 ? Math.round((risksWithControlsCount / totalRisks) * 100) : 0,
            controlsWithRisksCount,
            controlsWithRisksPct: totalControls > 0 ? Math.round((controlsWithRisksCount / totalControls) * 100) : 0,
            assetsWithControlsCount,
            assetsWithControlsPct: totalAssets > 0 ? Math.round((assetsWithControlsCount / totalAssets) * 100) : 0,
            unmappedRisks,
            uncoveredCriticalAssets,
            hotControls: hotControlsResult,
        };
    });
}
