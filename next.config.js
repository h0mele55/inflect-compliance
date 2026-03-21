const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const defaultOptions = {
    // Other experimental or default options
    experimental: {
        serverComponentsExternalPackages: ['pdfkit'],
    },
    async headers() {
        return [
            {
                // Apply these headers to all routes globally.
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
                    },
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Resource-Policy',
                        value: 'same-origin',
                    },
                    {
                        // Note: Only add max-age and preload if you guarantee HTTPS.
                        key: 'Strict-Transport-Security',
                        value: process.env.NODE_ENV === 'production' 
                            ? 'max-age=31536000; includeSubDomains; preload' 
                            : 'max-age=0',
                    },
                    {
                        // Phase 1 CSP: Conservative static CSP that supports Next.js app router safely
                        key: 'Content-Security-Policy',
                        value: `
                            default-src 'self';
                            base-uri 'self';
                            object-src 'none';
                            frame-ancestors 'none';
                            img-src 'self' data: https:;
                            font-src 'self' data: https:;
                            style-src 'self' 'unsafe-inline';
                            script-src 'self' 'unsafe-inline' 'unsafe-eval';
                            connect-src 'self' https:;
                        `.replace(/\s{2,}/g, ' ').trim()
                    }
                ],
            },
        ];
    },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
    ...defaultOptions,
    eslint: {
        // Lint runs separately in CI (npm run lint). Don't block builds.
        ignoreDuringBuilds: true,
    },
};
module.exports = withNextIntl(nextConfig);
