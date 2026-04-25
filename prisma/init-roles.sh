#!/bin/bash
# Docker entrypoint init script for Postgres
# Creates the app_user role required by RLS migrations.
# This runs automatically on first container start (fresh volume).

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
        RAISE NOTICE 'Created role app_user';
      END IF;
      -- The RLS-setup migration (20260323180000_apply_full_rls_setup)
      -- ends with \`GRANT app_user TO postgres\`. On the dev DB the
      -- POSTGRES_USER is \`postgres\` so that's a no-op; on the test DB
      -- (POSTGRES_USER=test) the migration fails with "role postgres
      -- does not exist". Pre-create a placeholder \`postgres\` role
      -- so the migration applies cleanly across both stacks. NOLOGIN
      -- means no actual auth attaches.
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres NOLOGIN;
        RAISE NOTICE 'Created placeholder role postgres for migration compat';
      END IF;
    END
    \$\$;

    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
    GRANT app_user TO $POSTGRES_USER;
EOSQL
