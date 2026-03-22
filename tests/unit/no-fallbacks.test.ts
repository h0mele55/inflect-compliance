import fs from 'fs';
import path from 'path';

function walkDir(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.next') {
                walkDir(filePath, fileList);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

describe('Static Analysis: No process.env fallbacks', () => {
    it('should not contain forbidden process.env or secret fallback patterns in src', () => {
        const srcDir = path.resolve(__dirname, '../../src');
        const files = walkDir(srcDir);

        let foundErrors = false;

        for (const file of files) {
            // Ignore the env definition itself since it maps process.env
            if (file.endsWith('env.ts')) continue;
            // Infrastructure routes intentionally use process.env for env gating / build info
            if (file.includes('health') && file.includes('route.ts')) continue;
            if (file.includes('staging') && file.includes('route.ts')) continue;
            // Stripe SDK wrapper intentionally uses process.env for lazy key loading
            if (file.endsWith('stripe.ts')) continue;
            // Observability modules bootstrap before env validation (OTel/Sentry/diagnostics)
            if (file.includes('observability')) continue;
            if (file.endsWith('instrumentation.ts')) continue;
            // Diagnostics endpoint reads runtime-only observability config (OTEL_*, SENTRY_*, LOG_LEVEL)
            if (file.includes('diagnostics') && file.includes('route.ts')) continue;

            const content = fs.readFileSync(file, 'utf8');

            // Look for `process.env.Something`
            if (content.includes('process.env.')) {
                console.error(`Forbidden 'process.env' usage found in ${file}`);
                foundErrors = true;
            }

            // Look for `|| "secret"` or `|| 'secret'` pattern (simplistic regex but effective)
            if (/\|\|\s*["'].*secret.*["']/i.test(content)) {
                console.error(`Forbidden hardcoded secret fallback found in ${file}`);
                foundErrors = true;
            }
        }

        expect(foundErrors).toBe(false);
    });
});
