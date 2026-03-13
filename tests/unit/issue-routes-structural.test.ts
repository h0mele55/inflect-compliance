/**
 * Issue Routes - Structural Tests
 * Ensures no Prisma imports or direct logAudit calls in route handlers.
 */
import * as fs from 'fs';
import * as path from 'path';

const ISSUE_ROUTES_DIR = path.join(process.cwd(), 'src/app/api/t/[tenantSlug]/issues');

function getAllRouteFiles(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllRouteFiles(fullPath));
        } else if (entry.name === 'route.ts') {
            files.push(fullPath);
        }
    }
    return files;
}

describe('Issue Route Structural Checks', () => {
    const routeFiles = getAllRouteFiles(ISSUE_ROUTES_DIR);

    it('should find at least 6 route files', () => {
        expect(routeFiles.length).toBeGreaterThanOrEqual(6);
    });

    routeFiles.forEach((filePath) => {
        const relativePath = path.relative(process.cwd(), filePath);

        it(`${relativePath} should not import prisma directly`, () => {
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).not.toMatch(/from\s+['"]@\/lib\/prisma['"]/);
            expect(content).not.toMatch(/from\s+['"]\.\.\/.*prisma['"]/);
            expect(content).not.toMatch(/import.*PrismaClient/);
        });

        it(`${relativePath} should not call logAudit or logEvent directly`, () => {
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).not.toMatch(/logAudit/);
            expect(content).not.toMatch(/logEvent/);
        });

        it(`${relativePath} should use withApiErrorHandling`, () => {
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).toMatch(/withApiErrorHandling/);
        });

        it(`${relativePath} should use getTenantCtx`, () => {
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).toMatch(/getTenantCtx/);
        });
    });
});
