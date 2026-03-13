// This script is meant to be run pre-build to ensure environment variables are present and valid
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { env } from '../src/env';

function main() {
    // Accessing `env` forces the validation to run
    if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is missing!'); // This should never hit due to Zod validation
    }
    console.log('Environment variables validated successfully.');
}

main();
