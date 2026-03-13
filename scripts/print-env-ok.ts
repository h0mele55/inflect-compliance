import { env } from '../src/env';

// This simply forces evaluation of the env schema
if (env.DATABASE_URL) {
    console.log('OK');
}
