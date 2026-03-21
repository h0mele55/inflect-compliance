/**
 * SoA Readiness Checks — Unit Tests
 *
 * Tests the runSoAChecks function logic for detecting gaps.
 */

import { runSoAChecks } from '@/app-layer/usecases/soa-checks';

describe('SoA Readiness Checks', () => {
    it('passes when all requirements are mapped, applicable, and have evidence', () => {
        const entries = [
            {
                requirementCode: '5.1',
                requirementTitle: 'Policies for information security',
                applicable: true,
                implementationStatus: 'IMPLEMENTED',
                mappedControls: [{ controlId: 'c1', code: 'AC-01', applicability: 'APPLICABLE', justification: null }],
                evidenceCount: 3,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(true);
        expect(result.errorCount).toBe(0);
        expect(result.warningCount).toBe(0);
        expect(result.issues).toHaveLength(0);
    });

    it('detects unmapped requirements', () => {
        const entries = [
            {
                requirementCode: '5.1',
                requirementTitle: 'Policies for information security',
                applicable: null,
                implementationStatus: null,
                mappedControls: [],
                evidenceCount: 0,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(false);
        expect(result.errorCount).toBe(1);
        expect(result.issues[0].rule).toBe('UNMAPPED');
        expect(result.issues[0].severity).toBe('error');
    });

    it('detects missing justification for NOT_APPLICABLE controls', () => {
        const entries = [
            {
                requirementCode: '7.1',
                requirementTitle: 'Physical security perimeters',
                applicable: false,
                implementationStatus: null,
                mappedControls: [
                    { controlId: 'c1', code: 'PHY-01', applicability: 'NOT_APPLICABLE', justification: null },
                    { controlId: 'c2', code: 'PHY-02', applicability: 'NOT_APPLICABLE', justification: 'Fully remote' },
                ],
                evidenceCount: 0,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(false);
        expect(result.errorCount).toBe(1);
        expect(result.issues[0].rule).toBe('MISSING_JUSTIFICATION');
        expect(result.issues[0].controlCode).toBe('PHY-01');
    });

    it('warns on NOT_STARTED applicable requirements', () => {
        const entries = [
            {
                requirementCode: '5.2',
                requirementTitle: 'Information security roles',
                applicable: true,
                implementationStatus: 'NOT_STARTED',
                mappedControls: [{ controlId: 'c1', code: 'AC-02', applicability: 'APPLICABLE', justification: null }],
                evidenceCount: 1,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(true); // warnings don't fail
        expect(result.warningCount).toBe(1);
        expect(result.issues[0].rule).toBe('NOT_STARTED');
    });

    it('warns on applicable requirements with no evidence', () => {
        const entries = [
            {
                requirementCode: '5.3',
                requirementTitle: 'Segregation of duties',
                applicable: true,
                implementationStatus: 'IMPLEMENTED',
                mappedControls: [{ controlId: 'c1', code: 'AC-03', applicability: 'APPLICABLE', justification: null }],
                evidenceCount: 0,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(true); // warnings don't fail
        expect(result.warningCount).toBe(1);
        expect(result.issues[0].rule).toBe('NO_EVIDENCE');
    });

    it('combines multiple issues from different requirements', () => {
        const entries = [
            {
                requirementCode: '5.1',
                requirementTitle: 'Policies',
                applicable: null,
                implementationStatus: null,
                mappedControls: [],
                evidenceCount: 0,
                openTaskCount: 0,
            },
            {
                requirementCode: '7.1',
                requirementTitle: 'Physical perimeters',
                applicable: false,
                implementationStatus: null,
                mappedControls: [{ controlId: 'c1', code: 'PHY-01', applicability: 'NOT_APPLICABLE', justification: null }],
                evidenceCount: 0,
                openTaskCount: 0,
            },
            {
                requirementCode: '5.2',
                requirementTitle: 'Roles',
                applicable: true,
                implementationStatus: 'NOT_STARTED',
                mappedControls: [{ controlId: 'c2', code: 'AC-02', applicability: 'APPLICABLE', justification: null }],
                evidenceCount: 0,
                openTaskCount: 0,
            },
        ];

        const result = runSoAChecks(entries);
        expect(result.pass).toBe(false); // errors present
        expect(result.errorCount).toBe(2); // UNMAPPED + MISSING_JUSTIFICATION
        expect(result.warningCount).toBe(2); // NOT_STARTED + NO_EVIDENCE
        expect(result.issues).toHaveLength(4);
    });
});
