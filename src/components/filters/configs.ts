import type { CompactFilterBarConfig } from './CompactFilterBar';

// ─── Controls ───

export const controlsFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search controls… (Enter)',
    filterKeys: ['q', 'status', 'applicability'],
    dropdowns: [
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'NOT_STARTED', label: 'Not Started' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'IMPLEMENTED', label: 'Implemented' },
                { value: 'NEEDS_REVIEW', label: 'Needs Review' },
            ],
        },
        {
            key: 'applicability',
            label: 'Applicability',
            options: [
                { value: 'APPLICABLE', label: 'Applicable' },
                { value: 'NOT_APPLICABLE', label: 'Not Applicable' },
            ],
        },
    ],
};

// ─── Tasks ───

export const tasksFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search tasks… (Enter)',
    filterKeys: ['q', 'status', 'type', 'severity', 'due'],
    dropdowns: [
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'OPEN', label: 'Open' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'IN_REVIEW', label: 'In Review' },
                { value: 'RESOLVED', label: 'Resolved' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'CANCELED', label: 'Canceled' },
            ],
        },
        {
            key: 'type',
            label: 'Type',
            options: [
                { value: 'TASK', label: 'Task' },
                { value: 'AUDIT_FINDING', label: 'Audit Finding' },
                { value: 'CONTROL_GAP', label: 'Control Gap' },
                { value: 'INCIDENT', label: 'Incident' },
                { value: 'IMPROVEMENT', label: 'Improvement' },
            ],
        },
        {
            key: 'severity',
            label: 'Severity',
            options: [
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
            ],
        },
    ],
    chips: [
        { key: 'overdue', label: 'Overdue', paramKey: 'due', value: 'overdue', icon: '⏰' },
        { key: 'due-soon', label: 'Due in 7d', paramKey: 'due', value: 'next7d', icon: '📅' },
    ],
};

// ─── Evidence ───

export const evidenceFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search evidence… (Enter)',
    filterKeys: ['q', 'type', 'controlId', 'tab'],
    dropdowns: [
        {
            key: 'type',
            label: 'Type',
            options: [
                { value: 'DOCUMENT', label: 'Document' },
                { value: 'SCREENSHOT', label: 'Screenshot' },
                { value: 'LOG', label: 'Log' },
                { value: 'CONFIG', label: 'Config' },
                { value: 'REPORT', label: 'Report' },
                { value: 'OTHER', label: 'Other' },
            ],
        },
    ],
};

// ─── Risks ───

export const risksFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search risks… (Enter)',
    filterKeys: ['q', 'status', 'category'],
    dropdowns: [
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'OPEN', label: 'Open' },
                { value: 'MITIGATING', label: 'Mitigating' },
                { value: 'ACCEPTED', label: 'Accepted' },
                { value: 'CLOSED', label: 'Closed' },
            ],
        },
        {
            key: 'category',
            label: 'Category',
            options: [
                { value: 'Technical', label: 'Technical' },
                { value: 'Operational', label: 'Operational' },
                { value: 'Compliance', label: 'Compliance' },
                { value: 'Strategic', label: 'Strategic' },
            ],
        },
    ],
};

// ─── Policies ───

export const policiesFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search policies… (Enter)',
    filterKeys: ['q', 'status', 'category'],
    dropdowns: [
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'DRAFT', label: 'Draft' },
                { value: 'IN_REVIEW', label: 'In Review' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'RETIRED', label: 'Retired' },
            ],
        },
        {
            key: 'category',
            label: 'Category',
            options: [
                { value: 'Information Security', label: 'Information Security' },
                { value: 'Access Control', label: 'Access Control' },
                { value: 'HR', label: 'HR' },
                { value: 'Physical', label: 'Physical' },
                { value: 'Compliance', label: 'Compliance' },
                { value: 'Operations', label: 'Operations' },
                { value: 'Risk Management', label: 'Risk Management' },
                { value: 'Business Continuity', label: 'Business Continuity' },
                { value: 'Supplier', label: 'Supplier' },
                { value: 'Other', label: 'Other' },
            ],
        },
    ],
};

// ─── Assets ───

export const assetsFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search assets… (Enter)',
    filterKeys: ['q', 'type', 'status'],
    dropdowns: [
        {
            key: 'type',
            label: 'Type',
            options: [
                { value: 'HARDWARE', label: 'Hardware' },
                { value: 'SOFTWARE', label: 'Software' },
                { value: 'NETWORK', label: 'Network' },
                { value: 'DATA', label: 'Data' },
                { value: 'PEOPLE', label: 'People' },
                { value: 'FACILITY', label: 'Facility' },
                { value: 'SERVICE', label: 'Service' },
            ],
        },
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'ACTIVE', label: 'Active' },
                { value: 'DECOMMISSIONED', label: 'Decommissioned' },
                { value: 'UNDER_REVIEW', label: 'Under Review' },
            ],
        },
    ],
};

// ─── Vendors ───

export const vendorsFilterConfig: CompactFilterBarConfig = {
    searchPlaceholder: 'Search vendors… (Enter)',
    filterKeys: ['q', 'status', 'criticality', 'reviewDue'],
    dropdowns: [
        {
            key: 'status',
            label: 'Status',
            options: [
                { value: 'ONBOARDING', label: 'Onboarding' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'UNDER_REVIEW', label: 'Under Review' },
                { value: 'SUSPENDED', label: 'Suspended' },
                { value: 'OFFBOARDED', label: 'Offboarded' },
            ],
        },
        {
            key: 'criticality',
            label: 'Criticality',
            options: [
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
            ],
        },
    ],
    chips: [
        { key: 'review-overdue', label: 'Review Overdue', paramKey: 'reviewDue', value: 'overdue', icon: '⏰' },
        { key: 'review-soon', label: 'Due in 30d', paramKey: 'reviewDue', value: 'next30d', icon: '📅' },
    ],
};
