// Replicate the exact logic from db-helper.ts
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function parseEnvKey(filePath, key) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const re = new RegExp(`^${key}=["']?([^"'\\n]*)["']?$`, 'm');
        const m = content.match(re);
        console.log(`parseEnvKey(${path.basename(filePath)}, ${key}):`, m ? m[1] : undefined);
        return m?.[1] || undefined;
    } catch {
        return undefined;
    }
}

// Test with .env
const url = parseEnvKey(path.join(ROOT, '.env'), 'DATABASE_URL');
console.log('Final URL:', url);

// Check if the URL contains &pgbouncer which would be interpreted by shell
if (url && url.includes('&')) {
    console.log('WARNING: URL contains & which may cause shell issues in execSync');
}
