const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('route.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const routesDir = path.join(__dirname, '../src/app/api/t');
const routes = walk(routesDir);

let failed = false;

for (const route of routes) {
    const content = fs.readFileSync(route, 'utf-8');
    // Regex for robust checking, accounting for different quote styles and spacing
    const hasPrismaImport = /import\s+prisma\s+from\s+['"]@\/lib\/prisma['"]/.test(content);
    const hasLogAuditImport = /import\s+\{\s*logAudit\s*\}\s+from\s+['"]@\/lib\/audit-log['"]/.test(content);

    if (hasPrismaImport || hasLogAuditImport) {
        console.error(`Architecture Violation in ${route}:`);
        if (hasPrismaImport) console.error('  - Direct prisma import found. Use Repositories instead.');
        if (hasLogAuditImport) console.error('  - Direct logAudit import found. Use logEvent from Usecases instead.');
        failed = true;
    }
}

if (failed) {
    console.error('Architecture enforcement failed.');
    process.exit(1);
} else {
    console.log('Architecture checks passed: No direct prisma or logAudit imports in API controllers.');
}
