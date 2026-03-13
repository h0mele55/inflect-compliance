/**
 * Structural guardrail: Ensures policy API route handlers are thin.
 * They must NOT contain direct Prisma calls or audit logging.
 */
import path from 'path';
import fs from 'fs';

const ROUTES_DIR = path.resolve(__dirname, '../../src/app/api/t/[tenantSlug]/policies');

function getAllRouteFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    function walk(d: string) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name === 'route.ts') files.push(full);
        }
    }
    walk(dir);
    return files;
}

describe('Policy API Route Structural Guardrails', () => {
    const routeFiles = getAllRouteFiles(ROUTES_DIR);

    it('should have at least 5 policy route files', () => {
        expect(routeFiles.length).toBeGreaterThanOrEqual(5);
    });

    describe.each(routeFiles.map(f => [path.relative(ROUTES_DIR, f), f]))('%s', (_, filePath) => {
        const content = fs.readFileSync(filePath as string, 'utf-8');

        it('should not call prisma directly', () => {
            // Check for prisma.model.method() patterns
            expect(content).not.toMatch(/prisma\./);
            expect(content).not.toMatch(/db\.\w+\.\w+/);
        });

        it('should not call logEvent or logAudit directly', () => {
            expect(content).not.toMatch(/logEvent\s*\(/);
            expect(content).not.toMatch(/logAudit\s*\(/);
        });

        it('should use withApiErrorHandling', () => {
            expect(content).toContain('withApiErrorHandling');
        });
    });
});
