import { RequestContext } from '../types';
import { MappingRepository } from '../repositories/MappingRepository';
import { assertCanRead } from '../policies/common';
import { FRAMEWORK_MAPPINGS, SOC2_REQUIREMENTS, NIS2_REQUIREMENTS } from '@/data/frameworks';
import { runInTenantContext } from '@/lib/db-context';

export async function getFrameworkMappings(ctx: RequestContext) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const controls = await MappingRepository.getControlsWithEvidence(db, ctx);

        // Build SOC 2 readiness view
        const soc2Categories = SOC2_REQUIREMENTS.map((req) => {
            const relatedMappings = FRAMEWORK_MAPPINGS.filter((m) => m.soc2Codes.includes(req.code));
            const relatedControls = controls.filter((c) =>
                relatedMappings.some((m) => m.isoControlId === c.annexId)
            );
            const implemented = relatedControls.filter((c) => c.status === 'IMPLEMENTED').length;
            const withEvidence = relatedControls.filter((c) => c.evidence.some((e) => e.status === 'APPROVED')).length;
            const total = relatedControls.length;

            return {
                ...req,
                mappings: relatedMappings,
                controlCount: total,
                implementedCount: implemented,
                evidenceCount: withEvidence,
                coverage: total > 0 ? Math.round((implemented / total) * 100) : 0,
            };
        });

        // Build NIS2 readiness view
        const nis2Areas = NIS2_REQUIREMENTS.map((req) => {
            const relatedMappings = FRAMEWORK_MAPPINGS.filter((m) => m.nis2Codes.includes(req.code));
            const relatedControls = controls.filter((c) =>
                relatedMappings.some((m) => m.isoControlId === c.annexId)
            );
            const implemented = relatedControls.filter((c) => c.status === 'IMPLEMENTED').length;
            const total = relatedControls.length;

            return {
                ...req,
                mappings: relatedMappings,
                controlCount: total,
                implementedCount: implemented,
                coverage: total > 0 ? Math.round((implemented / total) * 100) : 0,
            };
        });

        return { soc2: soc2Categories, nis2: nis2Areas, mappings: FRAMEWORK_MAPPINGS };
    });
}
