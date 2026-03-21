import type { Role } from '@prisma/client';

export type PermissionSet = {
    controls: { view: boolean; create: boolean; edit: boolean };
    evidence: { view: boolean; upload: boolean; edit: boolean; download: boolean };
    policies: { view: boolean; create: boolean; edit: boolean; approve: boolean };
    tasks: { view: boolean; create: boolean; edit: boolean; assign: boolean };
    risks: { view: boolean; create: boolean; edit: boolean };
    vendors: { view: boolean; create: boolean; edit: boolean };
    tests: { view: boolean; create: boolean; execute: boolean };
    frameworks: { view: boolean; install: boolean };
    audits: { view: boolean; manage: boolean; freeze: boolean; share: boolean };
    reports: { view: boolean; export: boolean };
    admin: { view: boolean; manage: boolean };
};

/**
 * Returns a static, granular UI PermissionSet for a given Role.
 * This ensures that client UI elements can rely on a consistent set of booleans
 * instead of manually checking `role === 'ADMIN' || role === 'EDITOR'`
 * which can lead to UI bugs and inconsistencies.
 * 
 * Note: Backend/API authorization must still independently verify permissions.
 */
export function getPermissionsForRole(role: Role): PermissionSet {
    switch (role) {
        case 'ADMIN':
            return {
                controls: { view: true, create: true, edit: true },
                evidence: { view: true, upload: true, edit: true, download: true },
                policies: { view: true, create: true, edit: true, approve: true },
                tasks: { view: true, create: true, edit: true, assign: true },
                risks: { view: true, create: true, edit: true },
                vendors: { view: true, create: true, edit: true },
                tests: { view: true, create: true, execute: true },
                frameworks: { view: true, install: true },
                audits: { view: true, manage: true, freeze: true, share: true },
                reports: { view: true, export: true },
                admin: { view: true, manage: true },
            };
        case 'EDITOR':
            return {
                controls: { view: true, create: true, edit: true },
                evidence: { view: true, upload: true, edit: true, download: true },
                // Editors cannot approve policies usually, or maybe they can?
                // Aligning with standard EDITOR: can't approve or admin.
                policies: { view: true, create: true, edit: true, approve: false },
                tasks: { view: true, create: true, edit: true, assign: true },
                risks: { view: true, create: true, edit: true },
                vendors: { view: true, create: true, edit: true },
                tests: { view: true, create: true, execute: true },
                frameworks: { view: true, install: false },
                audits: { view: true, manage: false, freeze: false, share: false },
                reports: { view: true, export: true },
                admin: { view: false, manage: false },
            };
        case 'AUDITOR':
            return {
                controls: { view: true, create: false, edit: false },
                // Auditors can often download evidence but not upload/edit
                evidence: { view: true, upload: false, edit: false, download: true },
                policies: { view: true, create: false, edit: false, approve: false },
                // Auditors might be able to assign or comment on tasks, but typically read-only. We'll set read-only here.
                tasks: { view: true, create: false, edit: false, assign: false },
                risks: { view: true, create: false, edit: false },
                vendors: { view: true, create: false, edit: false },
                tests: { view: true, create: false, execute: false },
                frameworks: { view: true, install: false },
                // Auditors can view and maybe export/share depending on policy, but let's keep view/share
                audits: { view: true, manage: false, freeze: false, share: true },
                reports: { view: true, export: true },
                admin: { view: false, manage: false },
            };
        case 'READER':
        default:
            return {
                controls: { view: true, create: false, edit: false },
                evidence: { view: true, upload: false, edit: false, download: true },
                policies: { view: true, create: false, edit: false, approve: false },
                tasks: { view: true, create: false, edit: false, assign: false },
                risks: { view: true, create: false, edit: false },
                vendors: { view: true, create: false, edit: false },
                tests: { view: true, create: false, execute: false },
                frameworks: { view: true, install: false },
                audits: { view: true, manage: false, freeze: false, share: false },
                reports: { view: true, export: false },
                admin: { view: false, manage: false },
            };
    }
}
