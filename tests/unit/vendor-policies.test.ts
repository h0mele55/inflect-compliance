import {
    assertCanReadVendors, assertCanManageVendors, assertCanManageVendorDocs,
    assertCanRunAssessment, assertCanApproveAssessment,
} from '../../src/app-layer/policies/vendor.policies';

describe('Vendor Policies', () => {
    const adminCtx: any = { permissions: { canRead: true, canWrite: true, canAdmin: true }, role: 'ADMIN' };
    const editorCtx: any = { permissions: { canRead: true, canWrite: true, canAdmin: false }, role: 'EDITOR' };
    const readerCtx: any = { permissions: { canRead: true, canWrite: false, canAdmin: false }, role: 'READER' };
    const auditorCtx: any = { permissions: { canRead: true, canWrite: false, canAdmin: false }, role: 'AUDITOR' };

    describe('assertCanReadVendors', () => {
        it.each([adminCtx, editorCtx, readerCtx, auditorCtx])('allows all roles', (ctx) => {
            expect(() => assertCanReadVendors(ctx)).not.toThrow();
        });
    });

    describe('assertCanManageVendors', () => {
        it('allows ADMIN', () => expect(() => assertCanManageVendors(adminCtx)).not.toThrow());
        it('allows EDITOR', () => expect(() => assertCanManageVendors(editorCtx)).not.toThrow());
        it('denies READER', () => expect(() => assertCanManageVendors(readerCtx)).toThrow());
        it('denies AUDITOR', () => expect(() => assertCanManageVendors(auditorCtx)).toThrow());
    });

    describe('assertCanManageVendorDocs', () => {
        it('allows ADMIN', () => expect(() => assertCanManageVendorDocs(adminCtx)).not.toThrow());
        it('allows EDITOR', () => expect(() => assertCanManageVendorDocs(editorCtx)).not.toThrow());
        it('denies READER', () => expect(() => assertCanManageVendorDocs(readerCtx)).toThrow());
        it('denies AUDITOR', () => expect(() => assertCanManageVendorDocs(auditorCtx)).toThrow());
    });

    describe('assertCanRunAssessment', () => {
        it('allows ADMIN', () => expect(() => assertCanRunAssessment(adminCtx)).not.toThrow());
        it('allows EDITOR', () => expect(() => assertCanRunAssessment(editorCtx)).not.toThrow());
        it('denies READER', () => expect(() => assertCanRunAssessment(readerCtx)).toThrow());
        it('denies AUDITOR', () => expect(() => assertCanRunAssessment(auditorCtx)).toThrow());
    });

    describe('assertCanApproveAssessment', () => {
        it('allows ADMIN', () => expect(() => assertCanApproveAssessment(adminCtx)).not.toThrow());
        it('denies EDITOR', () => expect(() => assertCanApproveAssessment(editorCtx)).toThrow());
        it('denies READER', () => expect(() => assertCanApproveAssessment(readerCtx)).toThrow());
        it('denies AUDITOR', () => expect(() => assertCanApproveAssessment(auditorCtx)).toThrow());
    });
});
