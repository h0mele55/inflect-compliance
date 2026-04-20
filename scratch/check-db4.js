const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

function parseEnvKey(filePath, key) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const re = new RegExp(`^${key}=["']?([^"'\\n]*)["']?$`, 'm');
        return content.match(re)?.[1] || undefined;
    } catch { return undefined; }
}

const url = parseEnvKey(path.join(ROOT, '.env'), 'DATABASE_URL');
console.log('URL:', url);

// This is the exact same check from db-helper.ts line 66-68
const cmd = `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:'${url.replace(/'/g, "\\\\'")}'}}});p.$connect().then(()=>p.$queryRaw\`SELECT 1\`).then(()=>{p.$disconnect();process.exit(0)}).catch(()=>{p.$disconnect().catch(()=>{});process.exit(1)})"`;
console.log('Command:', cmd);
try {
    execSync(cmd, { timeout: 5000, stdio: 'ignore', cwd: ROOT });
    console.log('DB_AVAILABLE: true');
} catch(e) {
    console.log('DB_AVAILABLE: false');
}
