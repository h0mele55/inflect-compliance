// Provide mandatory env vars for src/env.ts validation during tests
process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/testdb';
process.env.AUTH_SECRET = 'supersecretstringthatis16charplus';
process.env.JWT_SECRET = 'supersecretstringthatis16charplus';
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.MICROSOFT_CLIENT_ID = 'test-ms-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-secret';
process.env.UPLOAD_DIR = 'uploads';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

// Note: tests/unit/env.test.ts clears this and runs in a separate process
// so it can still test the actual validation logic.
// We set this to prevent env loader from crashing other unit tests.
process.env.SKIP_ENV_VALIDATION = '1';
