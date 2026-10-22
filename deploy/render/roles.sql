-- Phase 14C: separate migration-owner and runtime roles on a managed PostgreSQL (Render; Neon is the
-- evaluated alternative). Run ONCE, over TLS, by the provider's administrative user, which is not a
-- superuser. Mirrors deploy/postgres/init.sh (Phase 14A): the runtime role can never change schema.
-- Passwords come from the environment (never argv): OWNER_PASSWORD and APP_PASSWORD (render.py roles).
\set ON_ERROR_STOP on
\getenv owner_password OWNER_PASSWORD
\getenv app_password APP_PASSWORD
SELECT current_user AS admin_role, current_database() AS database_name \gset
-- PostgreSQL 16+ gives the creator of a role only ADMIN OPTION on it, not SET.
CREATE ROLE docversity_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE docversity_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
-- Take SET on the owner role just long enough to hand it the schema and act as it.
GRANT docversity_owner TO :"admin_role" WITH INHERIT FALSE, SET TRUE;
ALTER SCHEMA public OWNER TO docversity_owner;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO docversity_owner, docversity_app;
-- Schema grants and default privileges belong to the schema owner: issue them AS the owner (from
-- the administrator they would only warn and change nothing, and PostgreSQL 16+ refuses default
-- privileges for a role whose privileges the administrator does not inherit).
SET ROLE docversity_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO docversity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docversity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO docversity_app;
RESET ROLE;
REVOKE docversity_owner FROM :"admin_role";
-- Warnings never stop psql: assert the result instead, so a silent no-op fails loudly.
DO $$
BEGIN
  IF NOT has_schema_privilege('docversity_app', 'public', 'USAGE')
     OR has_schema_privilege('docversity_app', 'public', 'CREATE')
     OR has_database_privilege('docversity_app', current_database(), 'CREATE')
     OR (SELECT count(*) FROM pg_default_acl a JOIN pg_roles r ON r.oid = a.defaclrole
         WHERE r.rolname = 'docversity_owner' AND a.defaclobjtype IN ('r', 'S')) <> 2
     OR pg_has_role(current_user, 'docversity_owner', 'SET')
     OR (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'public') <> 'docversity_owner'
  THEN
    RAISE EXCEPTION 'Phase 14C role separation is incomplete; do not deploy';
  END IF;
END $$;
