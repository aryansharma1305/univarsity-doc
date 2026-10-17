# Phase 14A — Local staging and deployment readiness

Scope: local-only preparation for a future Ubuntu Hostinger VPS. No VPS was provisioned or accessed, no DNS was changed and no public ACME certificate was requested.
Phase 12C academic modules and certificate eligibility/templates are outside this change.

## Architecture

```text
127.0.0.1:3443 → Caddy (local CA) → Next.js → NestJS → PostgreSQL / Redis / private MinIO
                                             ↑
                                      BullMQ worker
```

Only Caddy has a host port, bound to loopback. The backend network is Docker-internal;
PostgreSQL, Redis, MinIO, API and worker have no published ports. This intentionally blocks
outbound integrations from backend services until explicitly designed. The frontend and proxy
share an edge network. The same-origin Next proxy preserves existing CSRF and authorization.

`deploy/Dockerfile` builds the monorepo with the pinned lockfile and creates separate web,
API, worker and one-shot operator images. Next uses monorepo standalone output and two build workers to bound build memory. API/worker
use production-only deployed dependencies. Base/service images are pinned by tested registry digest;
review security updates and refresh those pins deliberately. Application processes run as non-root with read-only
filesystems, writable bounded tmpfs, dropped capabilities, no-new-privileges and resource/PID
limits. Chromium remains necessary for the existing synthetic PDF previews. No academic
behavior or application permission is changed.

`deploy/compose.yml` creates independent named volumes and random local credentials.
Application DB credentials cannot create databases, roles or schema objects; migrations use a separate non-superuser database owner. A third bootstrap credential remains confined to PostgreSQL initialization.
MinIO application credentials are restricted to one private staging bucket; root credentials
are available only to storage initialization and explicit backup tools. Redis uses a random ACL-user password, staging-only key/channel access, disabled admin/flush commands, AOF and noeviction (BullMQ). No development auth bypasses, insecure cookies or Swagger
are enabled. Secure `__Host-` cookies and exact CORS origin remain enforced.

## Local commands

From a fresh checkout (Node 22, pnpm from packageManager, Docker Compose v2, Python 3):

```sh
python3 deploy/scripts/init-local.py
python3 deploy/scripts/check-config.py
python3 deploy/scripts/staging.py build
python3 deploy/scripts/staging.py up
python3 deploy/scripts/staging.py fixture
# Export only the public local CA certificate for the trusted HTTPS smoke client.
docker compose -f deploy/compose.yml cp proxy:/data/caddy/pki/authorities/local/root.crt .local/staging/local-ca.crt
python3 deploy/scripts/staging.py smoke
python3 deploy/scripts/staging.py status
python3 deploy/scripts/staging.py backup
python3 deploy/scripts/staging.py restore-test <timestamp-directory>
python3 deploy/scripts/staging.py stop
```

The initializer refuses to overwrite existing secrets. Host `.local/staging` is mode 0700;
secret files are read-only (0444) so non-root Docker Compose secret bind mounts can read them.
Do not expose that directory or add it to Git. `.dockerignore` excludes secrets, dev caches,
host dependencies, references and graph outputs. Fixtures refuse a non-empty staging database,
require Docker host `postgres` and fixed DB `docversity_staging`, create only clearly labeled
synthetic accounts and never import university data. Random credentials stay in local
`.local/staging/fixture.json`; they are not printed or baked into images.

Caddy automatic trust installation is disabled in the local configuration. The local CA is only for this staging environment; do not add its private key to a system trust
store or copy it to production. The smoke client trusts the exported CA explicitly and verifies
the `localhost` certificate hostname. Browser testing can use a dedicated profile with that
public CA trusted, without disabling TLS validation globally. No host trust settings are changed.

## Backup and recovery

The fixed staging command pauses proxy/web/API, then drains/stops the worker before taking a
custom-format PostgreSQL dump and object mirror. It restarts the stack even if backup fails.
Backups have SHA-256 manifests and private local permissions; no credential files are included.
Operator storage containers alone have filesystem access to the backup directory. They do not
publish ports. Treat even synthetic backups as private; encrypt real off-host backups later.

Restore rehearsal uses fixed separate project `docversity14a-restore`. It refuses any existing
recovery volumes, verifies the backup manifest, restores to fresh PostgreSQL/MinIO, reapplies
runtime grants and compares every database table fingerprint and object hash. It never uses
`--clean`, drops existing tables, overwrites the development stack or deletes existing volumes.
Recovery volumes are retained for inspection. Repeated rehearsal requires a new explicitly
reviewed disposable target; the script deliberately refuses to wipe the previous target.
Redis sessions are not restored: recovery invalidates logins. Before real backups, block writes,
drain all imports and resolve pending queue work; an application-consistent Redis/queue recovery
policy and off-host retention/RPO/RTO must be approved before production.

## Future Ubuntu VPS runbook — preparation only

1. Purchase/provision an appropriate Ubuntu LTS VPS in a separately authorized deployment phase.
   Confirm architecture, CPU, RAM, disk, bandwidth, region, operating budget and MinIO licensing.
   Local ARM64 testing does not establish AMD64 compatibility or real VPS capacity.
2. Create a named sudo operator using an SSH public key. Verify a second key login before disabling
   password/root SSH access. Keep the Hostinger recovery console available. Never commit private keys.
3. Install supported Docker Engine and Compose from [Docker's official Ubuntu repository](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository). Docker
   group membership is root-equivalent; restrict operators. Enable security updates and time sync.
4. Configure UFW/provider firewall for SSH from approved administrator IPs and inbound 80/443 only.
   [Docker-published ports can bypass UFW rules](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations): enforce the binding/network design and validate from
   outside the VPS too. Do not publish 5432, 6379, 9000, 9001, 3000 or 4000.
5. Generate independent production secrets in a root-controlled private directory. Never reuse
   staging keys. Docker Compose secret files are not an encrypted secret store; protect disk,
   access, off-host copies and recovery keys. Use a managed secret service if required.
6. Review a production Compose override explicitly: bind Caddy 80/443 publicly, use
   `deploy/Caddyfile.production`, supply PUBLIC_DOMAIN/ACME_EMAIL, set exact https WEB_URL/CORS,
   update backup/secret paths and retain private data networking. No production override is activated
   in this phase. Confirm internal service/queue names and database grants.
7. Only after authorization, configure domain A/AAAA records to the VPS and allow ACME challenges.
   [Caddy's production configuration prepares automatic HTTPS and redirects](https://caddyserver.com/docs/automatic-https); it is never loaded in
   local staging. Validate IPv4/IPv6, certificate renewal and reboot behavior on the actual host.
8. Build/tag immutable release images from a reviewed SHA, scan images and record digests. Back up
   first; run the reviewed migration image once, then bring up API, worker, web and proxy. Never run
   development seed commands, test fixtures or `migrate reset` in production.
9. Check service health, real dependency round-trips, staff/student login isolation, CSRF, private
   storage and disabled public verification/issuance. No university records may be copied into staging.
10. Roll back application images to the prior immutable tag only if schema compatibility is confirmed.
    Do not automatically reverse migrations. For incompatible schema changes, rehearse a full isolated
    recovery from the pre-upgrade backup and obtain an explicit cutover decision (data since backup
    would otherwise be lost). Preserve old volumes/images and incident evidence.

### Variables and secrets

Public/runtime settings: NODE_ENV=production, WEB_URL/CORS_ORIGINS exact HTTPS origin,
API_INTERNAL_URL=http://api:4000, API_HOST=0.0.0.0, API_PORT=4000,
WEB_BEHIND_TRUSTED_PROXY=true, TRUST_PROXY=2 for the fixed Caddy → Next → API path,
COOKIE_SECURE=true, SWAGGER_ENABLED=false, LOG_LEVEL, worker/import limits,
QUEUE_PREFIX and REDIS_KEY_PREFIX. Never expose the API through a shorter public proxy path;
reassess trusted hops before topology changes. Caddy overwrites untrusted forwarding headers;
web/API have no direct public listeners.

Secrets: bootstrap/owner/application DB passwords and DATABASE_URL, REDIS_URL/password,
SESSION_SECRET (random ≥32 characters), MinIO root credentials, bucket-scoped S3_ACCESS_KEY/
S3_SECRET_KEY. S3_ENDPOINT uses the private container service; S3_FORCE_PATH_STYLE=true.
See `.env.example` and current Zod schemas for all supported limits/defaults. The web receives
only its internal API URL and trust setting, not DB/storage/session secrets. The migration
container receives only the owner database connection. The worker receives only its database/Redis/storage and queue settings; it does not receive the API session-signing secret.

### Operations

Use `python3 deploy/scripts/staging.py status`, `docker compose -f deploy/compose.yml logs --tail 100`
and `docker stats --no-stream` locally. Logs are size-rotated; do not paste secrets or cookie jars.
Monitor API `/health` (DB SELECT, Redis PING, storage HeadBucket), worker round-trip queue health,
proxy/web health, restarts, latency, available memory, disk/inodes and volume growth. Alert before
storage fills. Redis persistence does not replace PostgreSQL/object backups.

Future scheduling: an operator-owned systemd timer should invoke a reviewed production backup
wrapper daily, with failure notifications, off-host encrypted copies, retention and regular isolated
restore rehearsals. No cron/systemd jobs are installed here. Keep logs and backups off public web
paths. Agree RPO/RTO, backup retention, key rotation, incident ownership and monitoring destination
before purchase/deployment.

## Verification evidence

Verified locally on Linux/ARM64 in Docker Desktop with an 8 GB VM. The branch is based on green
main `d0d07c7d72d09eb895cc0c5576518df0897e855b` (the UI-05 merge). No applied migrations,
academic modules, certificate templates, student/admin layouts or publication/eligibility rules changed.

| Check                      | Observed result                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Image builds               | Web, API, worker and migration/operator images built successfully                                                                  |
| Services                   | PostgreSQL, Redis, MinIO, API, worker, Next standalone and Caddy all healthy                                                       |
| Migrations                 | All 19 existing migrations applied by the non-superuser owner                                                                      |
| Custom DB initialization   | Fresh `docversity_initcheck` database owned by the migration role; runtime and owner roles non-superuser/NOCREATEDB                |
| TLS                        | Explicit local CA verifies the real HTTPS proxy; system-default curl rejects it with exit 60; no insecure client override          |
| Authentication             | Staff/student production cookies are Secure, HttpOnly, host-only, SameSite=Lax; sessions cannot cross portal boundaries            |
| Request boundaries         | Missing CSRF and foreign origins rejected; no wildcard credentialed CORS; Swagger unavailable                                      |
| Runtime credentials        | App cannot create schema/roles/databases; Redis rejects keys outside `staging:*`; S3 app cannot see/read the private canary bucket |
| PDF                        | Staff-only standard synthetic training PDF generated inside the API container with no-store headers                                |
| Observed logs              | Configured secrets and synthetic fixture passwords absent from collected staging logs                                              |
| Backup/recovery            | Consistent database dump + object mirror; every public table fingerprint and object SHA-256 matches a fresh recovery stack         |
| Recovery usability         | Restored student fixture and private object readable using limited app credentials                                                 |
| Recovery safety            | Existing recovery volumes refused; seven Python safety tests passed                                                                |
| Protected development data | All 38 original tables and 3,232 original MinIO objects unchanged in before/after comparison                                       |
| Repository gates           | Format, 28 uncached lint/typecheck tasks, 771 uncached unit/integration tests, 10-task production build and no schema drift passed |
| Browser suite              | All 61 tests passed in 9.8 minutes; no failures/skips/retries                                                                      |

The browser suite uses production builds on its existing dedicated QA ports and a separate QA
PostgreSQL/Redis/MinIO instance. Staging smoke tests independently traverse Caddy's trusted local TLS,
the standalone frontend proxy, API, database, Redis, worker queue health and private storage.
No test assertion was removed: a missing host Playwright browser after local cleanup was reinstalled;
the smoke script's student endpoint was corrected to the existing `/student/me` contract. MinIO's
filtered bucket listing was tested against an additional private canary rather than assuming that
listing accessible buckets must fail. The canary is an empty control fixture, not application data;
backups cover the application bucket.

### Resources observed

Post-start snapshot of the seven long-running staging services (not a peak/load benchmark):

| Service    | Memory                |
| ---------- | --------------------- |
| API        | 220.3 MiB             |
| Worker     | 97.33 MiB             |
| Next.js    | 61.95 MiB             |
| PostgreSQL | 44.02 MiB             |
| Redis      | 10.86 MiB             |
| MinIO      | 191.3 MiB             |
| Caddy      | 13.05 MiB             |
| Total      | Approximately 639 MiB |

This excludes builds, operator tools, the development/QA stacks and recovery services. Limits are
explicit in Compose; representative production imports, concurrent PDF requests, retention and
object growth still need capacity testing. Displayed local image sizes were approximately 437 MB
(web), 935 MB (worker), 2.15 GB (API with Chromium) and 2.02 GB (one-shot operator tools); shared layers
mean these should not be added as a unique disk-usage measurement. An earlier build ran short of disk;
verification was repeated after space became available. No broad Docker prune or deletion of other
agents' worktrees/data was performed. The initial empty staging bootstrap volume is retained, unused;
the final fresh staging volume uses the separate bootstrap/owner/runtime role design.

### Security scope and remaining decisions

No boundary violation was observed in the exercised deployment paths. This is a scoped deployment
review, not a complete penetration test. Production readiness still requires a purchased/provisioned
host, approved Ubuntu LTS and architecture, resource/load sizing, domain and firewall review,
independent production secrets, off-host encrypted backup retention, RPO/RTO, restore/cutover approval,
MinIO licensing review, monitoring/alerts and an update/incident owner. Compose secret files are not an
encrypted secret manager. Reassess trusted proxy hops if a CDN/load balancer or another ingress path
is introduced.

The separate GitHub staging job exercises Linux/AMD64 when green; its final status and links are
recorded in the PR/handoff. Actual Hostinger deployment, public DNS/certificates and VPS recovery
remain unverified and were not attempted. The required three tracked graphify navigation outputs
are regenerated under CLAUDE.md; they do not alter runtime behavior.

### Future-host command references (not executed)

After a separately authorized provisioning phase, generate a passphrase-protected operator SSH key,
install only its public key, and test a second SSH session before changing SSH daemon or firewall
settings. Follow the linked vendor repository instructions for the selected supported Ubuntu LTS;
avoid unattended convenience-install scripts for the production host.

Read-only readiness commands on that future host include `docker version`, `docker compose version`,
`sudo ufw status verbose`, `free -h`, `df -h`, `df -i` and `docker stats --no-stream`.
Local trusted-TLS verification is `curl --cacert .local/staging/local-ca.crt https://localhost:3443/health`.
Local certificates use Caddy's [internal CA without ACME or DNS validation](https://caddyserver.com/docs/automatic-https#local-https).
The official Docker/Caddy references were checked on 17 October 2026; no commands were executed on
an Ubuntu server and no real DNS/certificate operations were performed.

Recovery and QA services were stopped after verification; their volumes were retained. The main staging stack remains healthy. The graph tool reported partial extraction for two existing TypeScript barrel files; TypeScript checks passed, and the graph remains a navigation aid rather than authoritative code validation.

The local helper rejects remote Docker contexts/DOCKER_HOST endpoints before contacting an engine. Recovery target detection checks actual volume names, including unlabeled volumes, to prevent accidental reuse.
