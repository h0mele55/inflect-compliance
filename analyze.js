const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'src', 'app', 'api', 't', '[tenantSlug]');

function findRoutes(dir) {
    let routes = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            routes = routes.concat(findRoutes(fullPath));
        } else if (item.name === 'route.ts') {
            routes.push(fullPath);
        }
    }
    return routes;
}

const routes = findRoutes(apiDir);
let report = '';

routes.forEach(r => {
    const content = fs.readFileSync(r, 'utf-8');
    const relPath = path.relative(apiDir, r).replace(/\\/g, '/');

    // Find HTTP methods
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(m => content.includes(`export const ${m}`));

    // Find Prisma models accessed
    const prismaMatches = [...content.matchAll(/prisma\.([a-zA-Z0-9_]+)\./g)].map(m => m[1]);
    const models = [...new Set(prismaMatches)].filter(m => m !== '$transaction');

    // Find requireRole calls
    const roleMatches = [...content.matchAll(/requireRole\([^,]+,\s*'([^']+)'\)/g)].map(m => m[1]);
    const roles = [...new Set(roleMatches)];

    // Find validation
    const hasZod = content.includes('withValidatedBody') || content.includes('withValidatedQuery');

    // Find audit
    const hasAudit = content.includes('logAudit');

    report += `Route: /api/t/[tenantSlug]/${relPath.replace('/route.ts', '') || ''}\n`;
    report += `  Methods: ${methods.join(', ')}\n`;
    report += `  Models Accessed: ${models.join(', ')}\n`;
    report += `  Required Roles: ${roles.join(', ') || 'None (or implicitly handled)'}\n`;
    report += `  Validation: ${hasZod ? 'Yes' : 'No'}\n`;
    report += `  Has logAudit: ${hasAudit ? 'Yes' : 'No'}\n\n`;
});

fs.writeFileSync(path.join(__dirname, 'route-analysis.txt'), report);
console.log('Saved to route-analysis.txt');
