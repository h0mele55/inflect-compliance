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
            if (file.includes('readyz') && file.includes('route.ts')) continue;
            if (file.includes('livez') && file.includes('route.ts')) continue;
            if (file.includes('staging') && file.includes('route.ts')) continue;
            // Stripe SDK wrapper intentionally uses process.env for lazy key loading
            if (file.endsWith('stripe.ts')) continue;
            // Observability modules bootstrap before env validation (OTel/Sentry/diagnostics)
            if (file.includes('observability')) continue;
            if (file.endsWith('instrumentation.ts')) continue;
            // Diagnostics endpoint reads runtime-only observability config (OTEL_*, SENTRY_*, LOG_LEVEL)
            if (file.includes('diagnostics') && file.includes('route.ts')) continue;
            // AV webhook uses process.env for webhook auth that must run before env validation
            if (file.includes('av-webhook') && file.includes('route.ts')) continue;
            // Encryption module reads DATA_ENCRYPTION_KEY directly (must work before env validation)
            if (file.endsWith('encryption.ts') && file.includes('security')) continue;
            // Redis connection helper reads REDIS_URL directly (graceful null when unconfigured, pre-env-validation)
            if (file.endsWith('redis.ts') && file.includes('lib')) continue;
            // Edge middleware reads CSP_REPORT_ONLY before env validation (optional runtime toggle)
            if (file.endsWith('middleware.ts') && !file.includes('pii-middleware')) continue;
            // Dub-ported utility files use process.env by upstream design
            if (file.includes('dub-utils')) continue;
            // ui-config endpoint is intentionally a runtime process.env
            // reader so operators can toggle AUTH_CREDENTIALS_UI_HIDDEN
            // without a rebuild/rollout (NEXT_PUBLIC_* inlines at build
            // time). See the docblock in the file.
            if (file.endsWith('ui-config/route.ts')) continue;

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
