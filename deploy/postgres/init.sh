#!/bin/bash
set -euo pipefail
# Cluster bootstrap, migration owner and runtime user have separate credentials and privileges.
export OWNER_PASSWORD="$(cat /run/secrets/database_owner_password)"
export APP_PASSWORD="$(cat /run/secrets/database_app_password)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv database_name POSTGRES_DB
\getenv owner_password OWNER_PASSWORD
\getenv app_password APP_PASSWORD
CREATE ROLE docversity_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"database_name" OWNER TO docversity_owner;
ALTER SCHEMA public OWNER TO docversity_owner;
CREATE ROLE docversity_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"database_name" TO docversity_app;
GRANT USAGE ON SCHEMA public TO docversity_app;
ALTER DEFAULT PRIVILEGES FOR ROLE docversity_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docversity_app;
ALTER DEFAULT PRIVILEGES FOR ROLE docversity_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO docversity_app;
SQL
unset OWNER_PASSWORD APP_PASSWORD
