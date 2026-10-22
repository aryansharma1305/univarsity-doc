-- Phase 14C (G2), read-only: can this managed PostgreSQL's administrative user create the separate
-- owner/runtime roles? Run before roles.sql; it changes nothing.
SELECT version() AS server,
       current_user AS admin_role,
       r.rolsuper AS superuser,
       r.rolcreaterole AS can_create_roles,
       r.rolcreatedb AS can_create_databases,
       pg_get_userbyid(d.datdba) AS database_owner,
       pg_get_userbyid(n.nspowner) AS public_schema_owner,
       pg_has_role(current_user, n.nspowner, 'MEMBER') AS admin_controls_public_schema,
       current_setting('createrole_self_grant') AS createrole_self_grant
FROM pg_roles r, pg_database d, pg_namespace n
WHERE r.rolname = current_user AND d.datname = current_database() AND n.nspname = 'public';
