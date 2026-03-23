import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        DATABASE_URL: z.string().url(),

        // NextAuth
        NEXTAUTH_URL: z.preprocess(
            // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
            // Since NextAuth automatically uses the VERCEL_URL if present.
            (str) => process.env.VERCEL_URL ? process.env.VERCEL_URL : str,
            process.env.VERCEL ? z.string().optional() : z.string().url()
        ),
        AUTH_URL: z.preprocess(
            (str) => process.env.VERCEL_URL ? process.env.VERCEL_URL : str,
            process.env.VERCEL ? z.string().optional() : z.string().url()
        ),
        AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters long"),
        JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters long"),

        // Providers
        GOOGLE_CLIENT_ID: z.string().min(1, "Google Client ID is required"),
        GOOGLE_CLIENT_SECRET: z.string().min(1, "Google Client Secret is required"),
        MICROSOFT_CLIENT_ID: z.string().min(1, "Microsoft Client ID is required"),
        MICROSOFT_CLIENT_SECRET: z.string().min(1, "Microsoft Client Secret is required"),
        MICROSOFT_TENANT_ID: z.string().default("common"),

        // Rate Limiting
        RATE_LIMIT_ENABLED: z.enum(["0", "1"]).optional(),
        RATE_LIMIT_MODE: z.enum(["upstash", "memory"]).default("upstash"),
        AUTH_TEST_MODE: z.enum(["0", "1"]).optional(),
        UPSTASH_REDIS_REST_URL: z.string().url().optional(),
        UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

        // File Storage
        UPLOAD_DIR: z.string().min(1, "UPLOAD_DIR must be specified"),
        FILE_STORAGE_ROOT: z.string().optional(),
        FILE_MAX_SIZE_BYTES: z.coerce.number().optional(),
        FILE_ALLOWED_MIME: z.string().optional(),

        // Cloud Storage (S3/R2/MinIO)
        STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
        S3_BUCKET: z.string().optional(),
        S3_REGION: z.string().optional(),
        S3_ENDPOINT: z.string().optional(),
        S3_ACCESS_KEY_ID: z.string().optional(),
        S3_SECRET_ACCESS_KEY: z.string().optional(),

        // AV Scanning
        AV_WEBHOOK_SECRET: z.string().optional(),          // HMAC secret for webhook auth
        AV_SCAN_MODE: z.enum(["strict", "permissive", "disabled"]).default("permissive"),

        // Data Protection (Epic 8)
        DATA_ENCRYPTION_KEY: z.string().min(32, "DATA_ENCRYPTION_KEY must be at least 32 characters").optional(),

        // Security / CORS
        CORS_ALLOWED_ORIGINS: z.string().default(""),

        // SMTP / Email (all optional — when SMTP_HOST is absent, console sink is used)
        SMTP_HOST: z.string().optional(),
        SMTP_PORT: z.coerce.number().optional(),
        SMTP_USER: z.string().optional(),
        SMTP_PASS: z.string().optional(),
        SMTP_FROM: z.string().default("noreply@inflect.app"),

        // Stripe Billing
        STRIPE_SECRET_KEY: z.string().optional(),
        STRIPE_WEBHOOK_SECRET: z.string().optional(),
        STRIPE_PRICE_ID_PRO: z.string().optional(),
        STRIPE_PRICE_ID_ENTERPRISE: z.string().optional(),
        APP_URL: z.string().url().optional(),

        // AI Risk Assessment
        AI_RISK_PROVIDER: z.string().default('stub'),
        OPENROUTER_API_KEY: z.string().optional(),
        OPENROUTER_MODEL: z.string().optional(),
        AI_RISK_DAILY_QUOTA: z.string().optional(),
        AI_RISK_USER_RPM: z.string().optional(),
        AI_RISK_ENABLED: z.string().default('true'),
        AI_RISK_PLAN_REQUIRED: z.string().default(''),
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        // Example: NEXT_PUBLIC_CLIENT_VAR: z.string(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        AUTH_URL: process.env.AUTH_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
        JWT_SECRET: process.env.JWT_SECRET,

        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,

        RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
        RATE_LIMIT_MODE: process.env.RATE_LIMIT_MODE,
        AUTH_TEST_MODE: process.env.AUTH_TEST_MODE,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

        UPLOAD_DIR: process.env.UPLOAD_DIR,
        FILE_STORAGE_ROOT: process.env.FILE_STORAGE_ROOT,
        FILE_MAX_SIZE_BYTES: process.env.FILE_MAX_SIZE_BYTES,
        FILE_ALLOWED_MIME: process.env.FILE_ALLOWED_MIME,

        STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
        S3_BUCKET: process.env.S3_BUCKET,
        S3_REGION: process.env.S3_REGION,
        S3_ENDPOINT: process.env.S3_ENDPOINT,
        S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,

        AV_WEBHOOK_SECRET: process.env.AV_WEBHOOK_SECRET,
        AV_SCAN_MODE: process.env.AV_SCAN_MODE,

        DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,

        CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        SMTP_FROM: process.env.SMTP_FROM,

        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO,
        STRIPE_PRICE_ID_ENTERPRISE: process.env.STRIPE_PRICE_ID_ENTERPRISE,
        APP_URL: process.env.APP_URL,

        AI_RISK_PROVIDER: process.env.AI_RISK_PROVIDER,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
        AI_RISK_DAILY_QUOTA: process.env.AI_RISK_DAILY_QUOTA,
        AI_RISK_USER_RPM: process.env.AI_RISK_USER_RPM,
        AI_RISK_ENABLED: process.env.AI_RISK_ENABLED,
        AI_RISK_PLAN_REQUIRED: process.env.AI_RISK_PLAN_REQUIRED,
    },
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
     * This is especially useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Makes it so that empty strings are treated as undefined.
     * `SOME_VAR: z.string()` and `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
});
