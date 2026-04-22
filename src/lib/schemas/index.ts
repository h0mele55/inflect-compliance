/**
 * Zod schemas for all API request bodies.
 * All schemas use .strip() to remove unknown fields.
 * 
 * Naming convention:
 *   Create<Entity>Schema — for POST (required fields)
 *   Update<Entity>Schema — for PUT (partial or full updates)
 */
import { z } from 'zod';

export const EmptyBodySchema = z.object({}).strip();

// ─── Assets ───

export const CreateAssetSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: z.string().min(1, 'Type is required'),
    classification: z.string().optional(),
    owner: z.string().optional(),
    location: z.string().optional(),
    confidentiality: z.coerce.number().int().min(1).max(5).optional().default(3),
    integrity: z.coerce.number().int().min(1).max(5).optional().default(3),
    availability: z.coerce.number().int().min(1).max(5).optional().default(3),
    dependencies: z.string().optional().nullable(),
    businessProcesses: z.string().optional().nullable(),
    dataResidency: z.string().optional().nullable(),
    retention: z.string().optional().nullable(),
}).strip();

export const UpdateAssetSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    classification: z.string().optional(),
    owner: z.string().optional(),
    location: z.string().optional(),
    confidentiality: z.coerce.number().int().min(1).max(5).optional(),
    integrity: z.coerce.number().int().min(1).max(5).optional(),
    availability: z.coerce.number().int().min(1).max(5).optional(),
    dependencies: z.string().optional().nullable(),
    businessProcesses: z.string().optional().nullable(),
    dataResidency: z.string().optional().nullable(),
    retention: z.string().optional().nullable(),
}).strip();

// ─── Risks ───

export const CreateRiskSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    threat: z.string().optional(),
    vulnerability: z.string().optional(),
    impact: z.coerce.number().int().min(1).max(10).optional().default(3),
    likelihood: z.coerce.number().int().min(1).max(10).optional().default(3),
    treatment: z.string().optional().nullable(),
    treatmentOwner: z.string().optional().nullable(),
    treatmentNotes: z.string().optional().nullable(),
    targetDate: z.string().optional().nullable(),
}).strip();

export const UpdateRiskSchema = z.object({
    title: z.string().min(1).optional(),
    threat: z.string().optional(),
    vulnerability: z.string().optional(),
    impact: z.coerce.number().int().min(1).max(10).optional(),
    likelihood: z.coerce.number().int().min(1).max(10).optional(),
    treatment: z.string().optional().nullable(),
    treatmentOwner: z.string().optional().nullable(),
    treatmentNotes: z.string().optional().nullable(),
    targetDate: z.string().optional().nullable(),
}).strip();

export const LinkRiskControlSchema = z.object({
    controlId: z.string().min(1, 'controlId is required'),
}).strip();

// ─── Risk Status & Mapping ───


export const SetRiskStatusSchema = z.object({
    status: z.enum(['OPEN', 'MITIGATING', 'ACCEPTED', 'CLOSED']),
}).strip();

export const MapRiskControlSchema = z.object({
    controlId: z.string().min(1, 'controlId is required'),
}).strip();

export const MapControlAssetSchema = z.object({
    assetId: z.string().min(1, 'assetId is required'),
}).strip();

// ─── Controls ───

export const CreateControlSchema = z.object({
    code: z.string().optional().nullable(),
    annexId: z.string().optional().nullable(),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().nullable(),
    intent: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NEEDS_REVIEW']).optional().default('NOT_STARTED'),
    frequency: z.enum(['AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    evidenceSource: z.enum(['MANUAL', 'INTEGRATION']).optional().nullable(),
    automationKey: z.string().optional().nullable(),
    isCustom: z.boolean().optional().default(true),
}).strip();

export const UpdateControlSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    code: z.string().optional().nullable(),
    intent: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    frequency: z.enum(['AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional().nullable(),
    evidenceSource: z.enum(['MANUAL', 'INTEGRATION']).optional().nullable(),
    automationKey: z.string().optional().nullable(),
}).strip();

export const SetControlStatusSchema = z.object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NEEDS_REVIEW']),
}).strip();

export const SetControlApplicabilitySchema = z.object({
    applicability: z.enum(['APPLICABLE', 'NOT_APPLICABLE']),
    justification: z.string().optional().nullable().default(null),
}).strip();

export const SetControlOwnerSchema = z.object({
    ownerUserId: z.string().nullable(),
}).strip();

export const AddContributorSchema = z.object({
    userId: z.string().min(1, 'userId is required'),
}).strip();

export const CreateControlTaskSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().nullable(),
    assigneeUserId: z.string().optional().nullable(),
    dueAt: z.string().optional().nullable(),
}).strip();

export const UpdateControlTaskSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
    assigneeUserId: z.string().optional().nullable(),
    dueAt: z.string().optional().nullable(),
}).strip();

export const LinkEvidenceSchema = z.object({
    kind: z.enum(['FILE', 'LINK', 'INTEGRATION_RESULT']),
    fileId: z.string().optional().nullable(),
    url: z.string().url().optional().nullable(),
    note: z.string().optional().nullable(),
}).strip();

export const InstallTemplatesSchema = z.object({
    templateIds: z.array(z.string().min(1)).min(1, 'At least one template ID is required'),
}).strip();

export const MapRequirementSchema = z.object({
    requirementId: z.string().min(1, 'requirementId is required'),
}).strip();

export const SetApplicabilitySchema = z.object({
    applicability: z.enum(['APPLICABLE', 'NOT_APPLICABLE']),
    justification: z.string().optional().nullable(),
}).strip().refine(
    (data) => data.applicability === 'APPLICABLE' || (data.justification && data.justification.trim().length > 0),
    { message: 'Justification is required when marking a control as Not Applicable', path: ['justification'] }
);

// ─── Policies ───

export const CreatePolicySchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    reviewFrequencyDays: z.coerce.number().int().min(1).optional().nullable(),
    language: z.string().optional().nullable(),
    content: z.string().optional().nullable(), // initial markdown content
    templateId: z.string().optional().nullable(), // create from template
}).strip();

export const UpdatePolicyMetadataSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    reviewFrequencyDays: z.coerce.number().int().min(1).optional().nullable(),
    nextReviewAt: z.string().optional().nullable(),
    language: z.string().optional().nullable(),
}).strip();

export const CreatePolicyVersionSchema = z.object({
    contentType: z.enum(['MARKDOWN', 'HTML', 'EXTERNAL_LINK']),
    contentText: z.string().optional().nullable(),
    externalUrl: z.string().url('Must be a valid URL').optional().nullable(),
    changeSummary: z.string().optional().nullable(),
}).strip();

export const RequestApprovalSchema = z.object({
    versionId: z.string().min(1, 'versionId is required'),
}).strip();

export const DecideApprovalSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    comment: z.string().optional().nullable(),
}).strip();

export const PublishPolicySchema = z.object({
    versionId: z.string().min(1, 'versionId is required'),
}).strip();

// ─── Evidence ───

export const CreateEvidenceSchema = z.object({
    controlId: z.string().optional().nullable(),
    type: z.enum(['TEXT', 'FILE', 'LINK', 'SCREENSHOT']).optional().default('TEXT'),
    title: z.string().min(1, 'Title is required'),
    content: z.string().optional(),
    fileName: z.string().optional().nullable(),
    fileSize: z.coerce.number().optional().nullable(),
    category: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),          // Legacy free-text
    ownerUserId: z.string().optional().nullable(),    // Real user reference (preferred)
    reviewCycle: z.string().optional().nullable(),
    nextReviewDate: z.string().optional().nullable(),
}).strip();

export const CreateEvidenceFormSchema = CreateEvidenceSchema.extend({
    file: z.any().optional(), // File object caught from FormData
}).strip();

export const UpdateEvidenceSchema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    category: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),          // Legacy free-text
    ownerUserId: z.string().optional().nullable(),    // Real user reference (preferred)
    reviewCycle: z.string().optional().nullable(),
    nextReviewDate: z.string().optional().nullable(),
}).strip();

export const EvidenceReviewSchema = z.object({
    action: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']),
    comment: z.string().optional().nullable(),
}).strip();

// ─── Findings ───

export const CreateFindingSchema = z.object({
    auditId: z.string().optional().nullable(),
    severity: z.string().min(1, 'Severity is required'),
    type: z.string().min(1, 'Type is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    rootCause: z.string().optional().nullable(),
    correctiveAction: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
}).strip();

export const UpdateFindingSchema = z.object({
    severity: z.string().optional(),
    type: z.string().optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    rootCause: z.string().optional().nullable(),
    correctiveAction: z.string().optional().nullable(),
    owner: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    verificationNotes: z.string().optional().nullable(),
}).strip();

// ─── Audits ───

const ChecklistUpdateSchema = z.object({
    id: z.string().min(1),
    result: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
}).strip();

export const CreateAuditSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    scope: z.string().optional(),
    criteria: z.string().optional().nullable(),
    schedule: z.string().optional().nullable(),
    auditors: z.string().optional().nullable(),
    auditees: z.string().optional().nullable(),
    departments: z.string().optional().nullable(),
    generateChecklist: z.boolean().optional(),
}).strip();

export const UpdateAuditSchema = z.object({
    title: z.string().min(1).optional(),
    scope: z.string().optional(),
    criteria: z.string().optional().nullable(),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    auditors: z.string().optional().nullable(),
    auditees: z.string().optional().nullable(),
    checklistUpdates: z.array(ChecklistUpdateSchema).optional(),
}).strip();

// ─── Tasks (Unified Work Items) ───

export const CreateTaskSchema = z.object({
    title: z.string().min(1).max(500),
    type: z.enum(['AUDIT_FINDING', 'CONTROL_GAP', 'INCIDENT', 'IMPROVEMENT', 'TASK']).optional().default('TASK'),
    description: z.string().max(10000).nullable().optional(),
    severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
    source: z.enum(['MANUAL', 'TEMPLATE', 'POLICY_REVIEW', 'AUDIT', 'INTEGRATION']).optional(),
    dueAt: z.string().nullable().optional(),
    assigneeUserId: z.string().nullable().optional(),
    reviewerUserId: z.string().nullable().optional(),
    controlId: z.string().nullable().optional(),
    metadataJson: z.any().optional(),
}).strip();

export const UpdateTaskSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
    dueAt: z.string().nullable().optional(),
    controlId: z.string().nullable().optional(),
    reviewerUserId: z.string().nullable().optional(),
    metadataJson: z.any().optional(),
}).strip();

export const SetTaskStatusSchema = z.object({
    status: z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED']),
    resolution: z.string().max(5000).nullable().optional(),
}).strip();

export const AssignTaskSchema = z.object({
    assigneeUserId: z.string().nullable(),
}).strip();

export const AddTaskLinkSchema = z.object({
    entityType: z.enum(['CONTROL', 'FRAMEWORK_REQUIREMENT', 'RISK', 'ASSET', 'POLICY', 'EVIDENCE', 'FILE', 'AUDIT_PACK', 'VENDOR']),
    entityId: z.string().min(1),
    relation: z.enum(['RELATES_TO', 'EVIDENCE_FOR', 'BLOCKED_BY', 'CAUSED_BY', 'MITIGATED_BY']).optional(),
}).strip();

export const AddTaskCommentSchema = z.object({
    body: z.string().min(1).max(10000),
}).strip();

// ─── Task Bulk Actions ───

export const BulkTaskAssignSchema = z.object({
    taskIds: z.array(z.string().min(1)).min(1).max(100),
    assigneeUserId: z.string().nullable(),
}).strip();

export const BulkTaskStatusSchema = z.object({
    taskIds: z.array(z.string().min(1)).min(1).max(100),
    status: z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'CANCELED']),
    resolution: z.string().max(5000).optional(),
}).strip();

export const BulkTaskDueDateSchema = z.object({
    taskIds: z.array(z.string().min(1)).min(1).max(100),
    dueAt: z.string().nullable(),
}).strip();

// ─── Issue Compatibility Aliases (deprecated — use Task schemas) ───

/** @deprecated Use CreateTaskSchema */ export const CreateIssueSchema = CreateTaskSchema;
/** @deprecated Use UpdateTaskSchema */ export const UpdateIssueSchema = UpdateTaskSchema;
/** @deprecated Use SetTaskStatusSchema */ export const SetIssueStatusSchema = SetTaskStatusSchema;
/** @deprecated Use AssignTaskSchema */ export const AssignIssueSchema = AssignTaskSchema;
/** @deprecated Use AddTaskLinkSchema */ export const AddIssueLinkSchema = AddTaskLinkSchema;
/** @deprecated Use AddTaskCommentSchema */ export const AddIssueCommentSchema = AddTaskCommentSchema;
/** @deprecated Use BulkTaskAssignSchema */ export const BulkAssignSchema = BulkTaskAssignSchema;
/** @deprecated Use BulkTaskStatusSchema */ export const BulkStatusSchema = BulkTaskStatusSchema;
/** @deprecated Use BulkTaskDueDateSchema */ export const BulkDueDateSchema = BulkTaskDueDateSchema;

// ─── Clauses ───

export const UpdateClauseProgressSchema = z.object({
    status: z.string().min(1, 'Status is required'),
    notes: z.string().optional().nullable(),
}).strip();

// ─── Auth ───

export const AuthRegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    orgName: z.string().min(1),
}).strip();

// `action: 'login'` was removed 2026-04-22 — the old bespoke /api/auth/
// register login endpoint was a parallel path to NextAuth's Credentials
// provider. All production login now flows through NextAuth. The legacy
// union is kept as a single-variant union for Zod-discriminated-union
// compatibility; the variant check still catches other malformed bodies.
export const AuthActionSchema = z.discriminatedUnion('action', [
    AuthRegisterSchema.extend({ action: z.literal('register') }),
]);

// ─── Evidence Bundles ───

export const CreateBundleSchema = z.object({
    name: z.string().min(1).max(200),
}).strip();

export const AddBundleItemSchema = z.object({
    entityType: z.enum(['FILE', 'EVIDENCE', 'INTEGRATION']),
    entityId: z.string().min(1),
    label: z.string().max(500).optional(),
}).strip();

// ─── Vendor Management ───

export const CreateVendorSchema = z.object({
    name: z.string().min(1).max(200),
    legalName: z.string().max(300).optional().nullable(),
    websiteUrl: z.string().url().max(500).optional().nullable(),
    domain: z.string().max(200).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'OFFBOARDED']).optional(),
    criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    inherentRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
    dataAccess: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
    isSubprocessor: z.boolean().optional(),
    tags: z.array(z.string().max(50)).max(20).optional().nullable(),
    nextReviewAt: z.string().optional().nullable(),
    contractRenewalAt: z.string().optional().nullable(),
}).strip();

export const UpdateVendorSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    legalName: z.string().max(300).optional().nullable(),
    websiteUrl: z.string().url().max(500).optional().nullable(),
    domain: z.string().max(200).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    ownerUserId: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'OFFBOARDED']).optional(),
    criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    inherentRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
    residualRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
    dataAccess: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
    isSubprocessor: z.boolean().optional(),
    tags: z.array(z.string().max(50)).max(20).optional().nullable(),
    nextReviewAt: z.string().optional().nullable(),
    contractRenewalAt: z.string().optional().nullable(),
}).strip();

export const CreateVendorDocumentSchema = z.object({
    type: z.enum(['CONTRACT', 'SOC2', 'ISO_CERT', 'DPA', 'SECURITY_POLICY', 'PEN_TEST', 'OTHER']),
    fileId: z.string().optional().nullable(),
    externalUrl: z.string().url().max(1000).optional().nullable(),
    title: z.string().max(300).optional().nullable(),
    validFrom: z.string().optional().nullable(),
    validTo: z.string().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
}).strip();

export const StartAssessmentSchema = z.object({
    templateKey: z.string().min(1).max(100),
}).strip();

export const SaveAssessmentAnswersSchema = z.object({
    answers: z.array(z.object({
        questionId: z.string().min(1),
        answerJson: z.any(),
    })).min(1).max(200),
}).strip();

export const DecideAssessmentSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    notes: z.string().max(5000).optional().nullable(),
}).strip();

export const SetVendorReviewSchema = z.object({
    nextReviewAt: z.string().optional().nullable(),
    contractRenewalAt: z.string().optional().nullable(),
}).strip();

export const AddVendorLinkSchema = z.object({
    entityType: z.enum(['ASSET', 'RISK', 'ISSUE', 'CONTROL']),
    entityId: z.string().min(1),
    relation: z.enum(['USES', 'STORES_DATA_FOR', 'PROVIDES_SERVICE_TO', 'MITIGATES', 'RELATED']).optional(),
}).strip();

// ─── Control Test Schemas ───

export const CreateTestPlanSchema = z.object({
    name: z.string().min(1).max(500),
    description: z.string().max(10000).nullable().optional(),
    method: z.enum(['MANUAL', 'AUTOMATED']).optional().default('MANUAL'),
    frequency: z.enum(['AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional().default('AD_HOC'),
    ownerUserId: z.string().nullable().optional(),
    expectedEvidence: z.any().nullable().optional(),
    steps: z.array(z.object({
        instruction: z.string().min(1).max(10000),
        expectedOutput: z.string().max(10000).nullable().optional(),
    })).optional(),
}).strip();

export const UpdateTestPlanSchema = z.object({
    name: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).nullable().optional(),
    method: z.enum(['MANUAL', 'AUTOMATED']).optional(),
    frequency: z.enum(['AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
    ownerUserId: z.string().nullable().optional(),
    expectedEvidence: z.any().nullable().optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
}).strip();

export const CompleteTestRunSchema = z.object({
    result: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
    notes: z.string().max(10000).nullable().optional(),
    findingSummary: z.string().max(2000).nullable().optional(),
}).strip();

export const LinkTestEvidenceSchema = z.object({
    kind: z.enum(['FILE', 'EVIDENCE', 'LINK', 'INTEGRATION_RESULT']),
    fileId: z.string().nullable().optional(),
    evidenceId: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    integrationResultId: z.string().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
}).strip();
