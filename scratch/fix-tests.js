const fs = require('fs');

const FIXTURE_CODE = `
export const mockCtx: RequestContext = {
    tenantId: 'tenant-1',
    userId: 'system',
    requestId: 'req-1',
    role: 'ADMIN',
    permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
};
`;

function processFile(file, isOrchestrator) {
    let content = fs.readFileSync(file, 'utf8');

    // Add mockCtx definition
    if (!content.includes('export const mockCtx')) {
        content = content.replace('// ── In-Memory Sync Mapping Store ──', FIXTURE_CODE + '\n// ── In-Memory Sync Mapping Store ──');
    }

    // Replace push/pull/webhook calls
    content = content.replace(/\.push\(\s*\{/g, '.push({ ctx: mockCtx,');
    content = content.replace(/\.pull\(\s*\{/g, '.pull({ ctx: mockCtx,');
    content = content.replace(/\.handleWebhookEvent\(\s*\{/g, '.handleWebhookEvent({ ctx: mockCtx,');

    if (isOrchestrator) {
        // Find handleWebhookEvent definitions in StubOrchestrator and remove tenantId since it's now inside ctx
        content = content.replace(/tenantId:\s*'tenant-1',\s*\n\s*provider:\s*'stub',/g, 'provider: \'stub\',');
        content = content.replace(/tenantId:\s*'tenant-1',/g, ''); // Try to catch others
    }

    fs.writeFileSync(file, content);
}

processFile('d:/git/inflect-compliance/inflect-compliance/tests/unit/sync-orchestrator.test.ts', true);
processFile('d:/git/inflect-compliance/inflect-compliance/tests/unit/github-integration.test.ts', false);
processFile('d:/git/inflect-compliance/inflect-compliance/tests/unit/webhook-sync-dispatch.test.ts', false);

