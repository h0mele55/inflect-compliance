/**
 * Integration test helper: synchronous DB availability check.
 * Used to conditionally skip integration test suites that require PostgreSQL.
 */
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

// Parse DATABASE_URL from .env
const envPath = path.resolve(__dirname, '../../.env');
let dbUrl: string | undefined;
try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL="(.*)"$/m);
    dbUrl = match?.[1];
} catch { /* no .env file */ }

/**
 * Extract host and port from a PostgreSQL connection URL.
 */
function parseHostPort(url: string): { host: string; port: number } {
    try {
        const u = new URL(url);
        return { host: u.hostname || '127.0.0.1', port: parseInt(u.port, 10) || 5432 };
    } catch {
        return { host: '127.0.0.1', port: 5432 };
    }
}

/**
 * Synchronous TCP port check — returns true if the port is listening.
 * Uses a very short timeout (500ms) so it doesn't slow down test startup.
 */
function isTcpPortOpen(host: string, port: number): boolean {
    try {
        const { execSync } = require('child_process');
        execSync(
            `node -e "const s=require('net').connect(${port},'${host}');s.setTimeout(500);s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)})"`,
            { timeout: 2000, stdio: 'ignore' },
        );
        return true;
    } catch {
        return false;
    }
}

export const DB_URL = dbUrl;

const hp = dbUrl ? parseHostPort(dbUrl) : null;
export const DB_AVAILABLE = hp ? isTcpPortOpen(hp.host, hp.port) : false;
