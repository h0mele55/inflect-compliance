import { execSync } from 'child_process';
import path from 'path';

describe('Environment Variable Validation', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/print-env-ok.ts');

    const validEnv = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://user:password@localhost:5432/db',
        NEXTAUTH_URL: 'http://localhost:3000',
        AUTH_URL: 'http://localhost:3000',
        AUTH_SECRET: 'supersecretstringthatis16charplus',
        JWT_SECRET: 'supersecretstringthatis16charplus',
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-secret',
        MICROSOFT_CLIENT_ID: 'ms-client-id',
        MICROSOFT_CLIENT_SECRET: 'ms-secret',
        UPLOAD_DIR: '/tmp/uploads',
    };

    function runEnvScript(envOverrides: Record<string, string | undefined>) {
        const testEnv: any = { ...process.env, ...validEnv, ...envOverrides, SKIP_ENV_VALIDATION: '' };

        // Remove undefined explicitly
        Object.keys(testEnv).forEach(key => {
            if (testEnv[key] === undefined) delete testEnv[key];
        });

        // Use ts-node (tsx) to run the script since it imports TS files
        try {
            const output = execSync(`npx tsx ${scriptPath}`, {
                env: testEnv,
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            return { success: true, output };
        } catch (error: any) {
            return {
                success: false,
                output: error.stdout,
                error: error.stderr || error.message
            };
        }
    }

    it('should pass and print OK when all required vars are present', () => {
        const result = runEnvScript({});
        expect(result.success).toBe(true);
        expect(result.output).toContain('OK');
    });

    it('should fail when AUTH_SECRET is missing', () => {
        const result = runEnvScript({ AUTH_SECRET: undefined });
        expect(result.success).toBe(false);
        expect(result.error).toContain('AUTH_SECRET');
        expect(result.error).toContain('Required'); // Zod error indicator
    });

    it('should fail when AUTH_SECRET is too short', () => {
        const result = runEnvScript({ AUTH_SECRET: 'short' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('AUTH_SECRET');
        expect(result.error).toContain('must be at least 16 characters');
    });

    it('should fail when DATABASE_URL is not a valid URL', () => {
        const result = runEnvScript({ DATABASE_URL: 'not-a-db-url' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('DATABASE_URL');
        expect(result.error).toContain('Invalid url');
    });

    it('should pass validation even if NEXTAUTH_URL & AUTH_URL omitted entirely, relying on Vercel URL mapping if theoretically present', () => {
        const result = runEnvScript({ NEXTAUTH_URL: undefined, AUTH_URL: undefined, VERCEL: '1', VERCEL_URL: 'https://myapp.vercel.app' });
        if (!result.success) {
            console.error(result.error);
        }
        expect(result.success).toBe(true);
    });
});
