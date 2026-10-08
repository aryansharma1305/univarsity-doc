# Graph Report - docversity  (2026-10-09)

## Corpus Check
- 466 files · ~392,644 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 3598 nodes · 8443 edges · 169 communities (155 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 282 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a7261cf9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ref_react
- student-accounts/schemas.ts
- ImportsController
- config/package.json
- packages_validation_dist_index
- cn
- common.ts
- ui/package.json
- mapping-panel.tsx
- api/test/helpers.ts
- student-accounts.controller.ts
- database/package.json
- student-detail-view.tsx
- packages_types_dist_index
- auth.service.ts
- worker/package.json
- students.ts
- academic.controllers.ts
- support/db.ts
- .login
- auth.controller.ts
- scripts
- auth.schema.ts
- permissions.test.ts
- validation/package.json
- app.setup.ts
- activity.ts
- web/package.json
- import-detail-view.tsx
- tasks
- coming-soon.tsx
- Authentication
- Database Documentation
- types/package.json
- api/package.json
- student-create-view.tsx
- lib/api.ts
- health.service.ts
- ref_zod
- .activate
- SessionStore
- Frontend
- documents/package.json
- student/login/page.tsx
- server-auth.ts
- validation/src/index.ts
- student-pages.tsx
- student-overview.tsx
- .issue
- compilerOptions
- Institutional Certificate Registry
- e2e/support.ts
- Public Verification Portal Home Screen
- CsrfService
- devDependencies
- engine.ts
- prepare-e2e.mjs
- components.json
- Academic Result Verification Detail Screen
- dependencies
- student-auth/support.ts
- dependencies
- schemas.ts
- compilerOptions
- Admin Registry Dashboard Screen
- JsonLogger
- commit.test.ts
- http-exception.filter.ts
- AuthContext
- Excel Bulk Import Validation Screen
- Docker Compose (local infra)
- src/env.ts
- imports.test.tsx
- devDependencies
- status/page.tsx
- academic.test.ts
- Academic Trust Matrix design system
- compilerOptions
- user-menu.tsx
- RequirePermissions
- imports/package.json
- fixtures
- imports/src/index.ts
- ref_vitest
- QR Document Scanner & Verifier Screen
- testing.ts
- compilerOptions
- Documentation Index
- Architecture Overview
- nestjs.json
- nest-cli.json
- scripts
- scripts
- app/layout.tsx
- compilerOptions
- node.json
- documents/tsconfig.build.json
- types/tsconfig.build.json
- validation/tsconfig.build.json
- ImportFileError
- web/tsconfig.json
- student-rows.ts
- ImportsService
- database/tsconfig.build.json
- api/tsconfig.json
- (public)/page.tsx
- BullMQ worker on Redis (apps/worker)
- database/tsconfig.json
- documents/tsconfig.json
- types/tsconfig.json
- validation/tsconfig.json
- imports.service.ts
- ui/tsconfig.json
- test/registration-2025.test.ts
- development-fixtures.ts
- .prettierrc.json
- @docversity/config shared tooling configuration
- api/vitest.config.ts
- entrypoint.sh
- init.sh
- workbook.ts
- @nestjs/common
- storage/src/index.ts
- TestOnlyController
- storage/package.json
- student-fields.ts
- Imports (Phase 5: students / registrations)
- CLAUDE.md — Docversity
- mapping.ts
- registration-rules.ts
- S3ObjectStorage
- ObjectStorage
- node.js
- nextjs.js
- dependencies
- imports/tsconfig.build.json
- storage/tsconfig.build.json
- Student portal, profile changes and historic certificates — architecture (proposed)
- exports
- imports/tsconfig.json
- scripts
- storage/tsconfig.json
- prepare-test-database.ts
- base.js
- devDependencies
- Phase 6.5 — Student portal UI
- enqueue-health-test.ts
- database/src/index.ts
- PasswordResetNotifier
- create-admin-core.ts
- ADR-0005: Toolchain baseline and version pins
- QueueModule
- Product Decisions Already Agreed
- students/api.ts
- ZodValidationPipe
- getStudentSessionState
- AuthService
- dashboard.service.ts
- database.module.ts
- AcademicModule
- .constructor
- apps_api_dist_auth_password_service
- apps_api_dist_auth_password_service_passwordservice
- apps_api_dist_cli_create_admin_core
- apps_api_dist_cli_create_admin_core_createadmin
- apps_api_dist_cli_roles
- apps_api_dist_cli_roles_ensureroles

## God Nodes (most connected - your core abstractions)
1. `cn()` - 109 edges
2. `@nestjs/common` - 85 edges
3. `next` - 60 edges
4. `ApiConfig` - 48 edges
5. `RequirePermissions()` - 47 edges
6. `AuthContext` - 40 edges
7. `PrismaService` - 35 edges
8. `Button()` - 34 edges
9. `errorMessage()` - 32 edges
10. `CurrentAuth` - 30 edges

## Surprising Connections (you probably didn't know these)
- `Consequences` --references--> `StudentRoute()`  [INFERRED]
  docs/decisions/ADR-0010-student-authentication.md → apps/api/src/student-auth/student-auth.decorators.ts
- `Retries and failures` --references--> `ImportFileError`  [INFERRED]
  docs/architecture/imports.md → packages/imports/src/errors.ts
- `Imports API (`/api/v1/imports`)` --references--> `status()`  [INFERRED]
  docs/api/imports.md → apps/api/src/academic/activity.ts
- `6. Backend conventions (apps/api)` --references--> `AuthGuard`  [INFERRED]
  CLAUDE.md → apps/api/src/auth/auth.guard.ts
- `6. Backend conventions (apps/api)` --references--> `AppError`  [INFERRED]
  CLAUDE.md → apps/api/src/common/app-error.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Credential Trust Guarantees (feature cards)** — references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_ecc200_cryptogram, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_immutable_timestamp, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_ferpa_gdpr_clean [EXTRACTED 1.00]
- **Global guard chain (Auth → CSRF → Permissions)** — docs_architecture_authorization_authguard, docs_architecture_authorization_csrfguard, docs_architecture_authorization_permissionsguard, docs_architecture_authentication_redis_sessions, docs_architecture_authorization_permissions [EXTRACTED 1.00]
- **Public Verification Services** — references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_check_results_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_registration_verification_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_certificate_verification_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_qr_scan_service [EXTRACTED 1.00]
- **Integrity and trust signals** — references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_vault_integrity_hash, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_tamper_evident_verification, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_registry_audit_log [INFERRED 0.75]
- **Credential lifecycle: import results, issue certificates, verify** — references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_imports_panel, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_certificates_panel, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_verification_activity [INFERRED 0.85]
- **Certificate Master-Detail Management Workflow** — references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_registry_master_ledger, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_parchment_renderer, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_immediate_operations_panel [INFERRED 0.85]
- **Credential Tamper-Evidence Stack** — references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_sha256_document_hashing, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_hardware_hsm_sealing, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_pki_digital_signatures, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_arweave_storage_node, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_foil_watermark_security [INFERRED 0.85]
- **Core architecture split: Next.js UI, NestJS API, BullMQ worker, object storage, Redis sessions** — docs_decisions_adr_0002_separate_api_nextjs_ui_only, docs_decisions_adr_0002_separate_api_nestjs_rest_api, docs_decisions_adr_0003_background_worker_bullmq_worker, docs_decisions_adr_0004_object_storage_objectstorage_port, docs_decisions_adr_0007_authentication_sessions_redis_sessions, docs_decisions_adr_0006_database_enforced_integrity_database_enforced_integrity [INFERRED 0.85]
- **Shared workspace packages consumed by web, API and worker** — packages_config_readme_docversity_config, packages_documents_readme_docversity_documents, packages_types_readme_docversity_types, packages_ui_readme_docversity_ui, packages_validation_readme_docversity_validation [INFERRED 0.85]
- **Document Verification Paths (scan, serial, registrar escalation)** — references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_live_optical_scan_viewport, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_manual_token_resolution, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_verification_protocol_notice [INFERRED 0.85]
- **Grade Computation & Summary** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_marks_credits_table, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_ugc_cbcs_grading_scale, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_sgpa_cgpa, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_result_summary_kpi_cards [INFERRED 0.85]
- **Record Trust & Authenticity Signals** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_verification_status_banner, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_verification_ref_qr_block, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_registrar_ratification_badge, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_institutional_verification_hash, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_academic_ledger [INFERRED 0.85]
- **Bulk import validation pipeline (mapping, rules, error review, atomic commit)** — references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_intelligent_column_mapping, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_academic_rules_enforced, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_error_review_table, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_atomic_transaction_import [INFERRED 0.85]
- **Three-Step Verification Protocol** — references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_hero_record_search, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_sha256_ledger_query, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_certified_pdf_attestation [INFERRED 0.85]
- **Single authoritative certificate record incl. legacy QR compatibility** — docs_architecture_product_decisions_one_authoritative_certificate_record, docs_database_readme_certificate_source_of_truth, docs_database_readme_certificates_table, docs_database_readme_legacy_mappings_table, docs_architecture_product_decisions_historic_qr_compatibility, docs_architecture_product_decisions_legacy_wordpress_system [INFERRED 0.85]
- **Stitch reference screens implementing Academic Trust Matrix** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_academic_trust_matrix_design_academic_trust_matrix [INFERRED 0.85]
- **Shared Zod contract across API, OpenAPI and web forms** — readme_packages_validation, docs_api_readme_zod_openapi_single_source, docs_api_readme_swagger, docs_architecture_frontend_api_client, docs_architecture_frontend_react_hook_form_shared_zod [INFERRED 0.85]

## Communities (169 total, 14 thin omitted)

### Community 0 - "ref_react"
Cohesion: 0.08
Nodes (50): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+42 more)

### Community 1 - "student-accounts/schemas.ts"
Cohesion: 0.06
Nodes (31): ACTIVATION_CODE_ALPHABET, ACTIVATION_CODE_LENGTH, activationCodeInput, IssueActivationCodes, issueActivationCodesSchema, IssuedActivationCodes, issuedActivationCodesSchema, passwordInput (+23 more)

### Community 2 - "ImportsController"
Cohesion: 0.14
Nodes (22): ApiConsumes, ApiProduces, download(), ImportsController, RowNumberPipe, StepDocs(), ApiBody, ApiCookieAuth (+14 more)

### Community 3 - "config/package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, eslint, eslint, globals, typescript, name, peerDependencies (+7 more)

### Community 4 - "packages_validation_dist_index"
Cohesion: 0.07
Nodes (57): Field(), SelectField(), applyServerErrors(), useSaveAcademicSession(), EMPTY, SESSION_STATUS_OPTIONS, SessionDialog(), departmentKeys (+49 more)

### Community 5 - "cn"
Cohesion: 0.05
Nodes (71): AdminBreadcrumbs(), NavLinks(), sidebarPreference, BreadcrumbLabelProvider(), LabelContext, Setter, useBreadcrumbLabel(), ADMIN_NAV (+63 more)

### Community 6 - "common.ts"
Cohesion: 0.05
Nodes (60): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSession, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema (+52 more)

### Community 7 - "ui/package.json"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "mapping-panel.tsx"
Cohesion: 0.11
Nodes (30): getError(), selectValue(), useSessionOptions(), DATE_FORMATS, AUTOMATIC_LABEL, DefaultSessionSelect(), Options, STATUS_OPTIONS (+22 more)

### Community 9 - "api/test/helpers.ts"
Cohesion: 0.16
Nodes (29): attempt(), config, postPreAuth(), as(), attemptsFromForwardedIps(), healthWith(), Agent, browser() (+21 more)

### Community 10 - "student-accounts.controller.ts"
Cohesion: 0.09
Nodes (22): UuidParamPipe, error, StudentAccountsModule, Module, portalState(), RegistrationRow, rowInclude, StudentAccountsService (+14 more)

### Community 11 - "database/package.json"
Cohesion: 0.05
Nodes (42): dependencies, @prisma/adapter-pg, @prisma/client, description, devDependencies, @docversity/config, eslint, prisma (+34 more)

### Community 12 - "student-detail-view.tsx"
Cohesion: 0.14
Nodes (21): useSetBreadcrumbLabel(), initials(), CompletedPanel(), CodesDialog(), Detail(), useStudent(), useStudentActivity(), ActivityTab() (+13 more)

### Community 13 - "packages_types_dist_index"
Cohesion: 0.06
Nodes (56): AcademicSessionsService, CODE_CONFLICT, include, SessionRow, toSession(), Injectable, CODE_CONFLICT, DepartmentRow (+48 more)

### Community 14 - "auth.service.ts"
Cohesion: 0.07
Nodes (23): assertPasswordPolicy(), ClientInfo, toAuthUser(), Inject, summariseUserAgent(), IdentifierHasher, Inject, Injectable (+15 more)

### Community 15 - "worker/package.json"
Cohesion: 0.05
Nodes (42): dependencies, bullmq, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation, ioredis (+34 more)

### Community 16 - "students.ts"
Cohesion: 0.06
Nodes (35): ActivityList, activityListSchema, CreateRegistration, CreateRegistrationInput, createRegistrationSchema, CreateStudent, CreateStudentInput, NewRegistration (+27 more)

### Community 17 - "academic.controllers.ts"
Cohesion: 0.07
Nodes (26): error, MUTATION_ERRORS, packages_validation_dist_index_academicsessionlist, packages_validation_dist_index_academicsessionqueryschema, packages_validation_dist_index_activitylist, packages_validation_dist_index_createacademicsessionschema, packages_validation_dist_index_createdepartmentschema, packages_validation_dist_index_createprogramschema (+18 more)

### Community 18 - "support/db.ts"
Cohesion: 0.13
Nodes (17): packages_database_src_index_prismaclient, db, f, db, f, db, f, db (+9 more)

### Community 19 - ".login"
Cohesion: 0.20
Nodes (21): ApiAcceptedResponse, AuthController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity (+13 more)

### Community 20 - "auth.controller.ts"
Cohesion: 0.10
Nodes (28): errorResponse, cookieNames, PRE_AUTH_CSRF_MAX_AGE_MS, preAuthCsrfCookieOptions(), readCookie(), sessionCookieOptions(), openApiRequestSchema(), clientInfo() (+20 more)

### Community 21 - "scripts"
Cohesion: 0.06
Nodes (32): description, devDependencies, prettier, turbo, typescript, engines, node, typescript (+24 more)

### Community 22 - "auth.schema.ts"
Cohesion: 0.08
Nodes (27): AuthUser, authUserSchema, ChangePasswordRequest, changePasswordRequestSchema, csrfTokenResponseSchema, emailSchema, ForgotPasswordRequest, forgotPasswordRequestSchema (+19 more)

### Community 23 - "permissions.test.ts"
Cohesion: 0.07
Nodes (27): ACADEMIC_AUDIT_ACTIONS, AUDIT_ACTIONS, AuditAction, IMPORT_AUDIT_ACTIONS, packages_types_src_index_all_permissions, packages_types_src_index_permissions, packages_types_src_index_permissionsforroles, packages_types_src_index_role_names (+19 more)

### Community 24 - "validation/package.json"
Cohesion: 0.07
Nodes (28): dependencies, zod, description, devDependencies, @docversity/config, eslint, @types/node, typescript (+20 more)

### Community 25 - "app.setup.ts"
Cohesion: 0.11
Nodes (21): AppModule, Module, API_ROUTE_PREFIX, configureApp(), installNotFoundFallback(), LOG_LEVELS, logLevelsFor(), OPENAPI_JSON_PATH (+13 more)

### Community 26 - "activity.ts"
Cohesion: 0.24
Nodes (9): AuditRow, count(), FIELD_LABELS, fields(), plural(), status(), summarizeAudit(), viaImport() (+1 more)

### Community 27 - "web/package.json"
Cohesion: 0.06
Nodes (29): description, @docversity/config, @docversity/database, @docversity/imports, @docversity/types, @docversity/validation, eslint, globals (+21 more)

### Community 28 - "import-detail-view.tsx"
Cohesion: 0.06
Nodes (41): toggleStatus(), useImportJob(), useImportRow(), useImportStep(), CancelButton(), CommitCard(), FailedPanel(), ImportDetailView() (+33 more)

### Community 29 - "tasks"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "coming-soon.tsx"
Cohesion: 0.10
Nodes (9): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+1 more)

### Community 31 - "Authentication"
Cohesion: 0.08
Nodes (37): Redis 7.4 service, Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Login rate limiting (fixed-window Redis counters), Password reset (single-use token in URL fragment), Redis unavailable → fail closed (503) (+29 more)

### Community 32 - "Database Documentation"
Cohesion: 0.08
Nodes (35): Academic audit events (safe metadata), No-deletes rule (deactivate via status), Standard error envelope (code, message, requestId), Correlation IDs and redacted JSON logs, ADR-0006 Database-enforced integrity, Excel import architecture (upload → map → validate → commit), Runtime topology (browser → web → api → Redis/worker), Agreed public/admin routing reference (+27 more)

### Community 33 - "types/package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "api/package.json"
Cohesion: 0.06
Nodes (30): description, bullmq, @docversity/config, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+22 more)

### Community 35 - "student-create-view.tsx"
Cohesion: 0.14
Nodes (15): metadata, metadata, useSessionUser(), DashboardView(), useCreateStudent(), EMPTY, StudentCreateView(), Card() (+7 more)

### Community 36 - "lib/api.ts"
Cohesion: 0.06
Nodes (45): QueryProvider(), sessionKeys, sessionsApi, useAcademicSessions(), importKeys, importsApi, RUNNING_STATUSES, useImportRows() (+37 more)

### Community 37 - "health.service.ts"
Cohesion: 0.09
Nodes (20): ApiServiceUnavailableResponse, TimeoutError, withTimeout(), HealthController, ApiOkResponse, ApiOperation, ApiTags, Controller (+12 more)

### Community 38 - "ref_zod"
Cohesion: 0.09
Nodes (23): ImportLimitsEnv, importLimitsEnvSchema, QueueEnv, queueEnvSchema, EnvValidationError, parseEnv(), envBoolean, httpUrl (+15 more)

### Community 39 - ".activate"
Cohesion: 0.19
Nodes (19): StudentAuthController, StudentController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity (+11 more)

### Community 40 - "SessionStore"
Cohesion: 0.09
Nodes (16): AuthGuard, Inject, Injectable, sha256(), PasswordResetStore, Inject, Injectable, Inject (+8 more)

### Community 41 - "Frontend"
Cohesion: 0.12
Nodes (24): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Paginated list contract (page, pageSize, sortBy allow-list), Authentication endpoints (/api/v1/auth/*), Frontend, AdminShell (protected admin layout), List state in the URL (+16 more)

### Community 42 - "documents/package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "student/login/page.tsx"
Cohesion: 0.32
Nodes (5): metadata, StudentLoginPage(), metadata, StudentRegisterPage(), StudentAuthPage()

### Community 44 - "server-auth.ts"
Cohesion: 0.19
Nodes (10): AdminLoginPage(), metadata, ProtectedAdminLayout(), AdminShell(), getSessionState(), SESSION_COOKIES, SessionState, STUDENT_COOKIES (+2 more)

### Community 45 - "validation/src/index.ts"
Cohesion: 0.10
Nodes (15): ERROR_CODES, ErrorCode, ErrorResponse, errorResponseSchema, HealthResponse, healthResponseSchema, HealthServiceName, ServiceStatus (+7 more)

### Community 46 - "student-pages.tsx"
Cohesion: 0.13
Nodes (12): metadata, metadata, metadata, Page(), metadata, initialsOf(), StudentAvatar(), PLANNED_MODULES (+4 more)

### Community 47 - "student-overview.tsx"
Cohesion: 0.23
Nodes (13): STATUS_LABELS, primaryRegistration(), STUDENT_NAV, StudentNavHref, StudentNavItem, DetailList(), PageIntro(), PortalCard() (+5 more)

### Community 48 - ".issue"
Cohesion: 0.17
Nodes (15): StudentAccountsController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity, ApiTags (+7 more)

### Community 49 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+11 more)

### Community 50 - "Institutional Certificate Registry"
Cohesion: 0.14
Nodes (20): Academic Session Selector & Global Search, Arweave Decentralized Storage Node, Audit Trail (Verification Queries), Certificate Revocation / Disciplinary Annulment, Certificate Status Lifecycle (Issued, Pending Sign-off, Revoked), Credential Status KPI Cards, Degree Certificate Parchment Template, Foil & Watermark Physical Security (+12 more)

### Community 51 - "e2e/support.ts"
Cohesion: 0.23
Nodes (13): SERVICES, issueCode(), Account, capture(), E2EFixtures, expectNoHorizontalOverflow(), expectNoSeriousA11yViolations(), fixtures() (+5 more)

### Community 52 - "Public Verification Portal Home Screen"
Cohesion: 0.13
Nodes (19): Bulk Verification & Institutional Access (Enterprise Gateway), Certificate Serial Format DOC-[YEAR]-[SERIAL], Certificate Verification (Conferrals & Degrees), Certified PDF Attestation (sealed PDF with audit trail and verification token), Check Results (Transcripts & Grades), Authenticated Credentials Stats Banner (148,290+ issued, 100% official, instant), Docversity Academic Registry, FERPA & GDPR Compliance (+11 more)

### Community 53 - "CsrfService"
Cohesion: 0.19
Nodes (6): normalizeOrigin(), Inject, CsrfService, Inject, Injectable, Inject

### Community 54 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @axe-core/playwright, @docversity/config, @docversity/database, @docversity/imports, eslint, globals, jsdom (+11 more)

### Community 55 - "engine.ts"
Cohesion: 0.08
Nodes (54): appendAudit(), chunks(), computeRowCounts(), dateOnly(), Db, ExistingRow, existingSelect, fromDateOnly() (+46 more)

### Community 56 - "prepare-e2e.mjs"
Cohesion: 0.11
Nodes (18): loadRootEnv(), ProvidedContext, setup(), vitest, credentials, db, dir, registrar (+10 more)

### Community 57 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 58 - "Academic Result Verification Detail Screen"
Cohesion: 0.16
Nodes (17): Institutional Academic Ledger (Folio), Academic Result Verification Detail Screen, Authenticated Transcript Header Card, Office of the Controller of Examinations, Docversity UI/UX Design System (navy/blue institutional palette, card layout), Docversity Registry Footer (Verification Services, Institutional Governance, ISO 27001, FERPA/GDPR), Institutional Verification Code (Hash), Statement of Marks & Credits Table (+9 more)

### Community 59 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, bullmq, cookie, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+11 more)

### Community 60 - "student-auth/support.ts"
Cohesion: 0.24
Nodes (16): Staff, config, lines, activate(), activatedStudent(), Agent, cookieNamesOf(), expectStatus() (+8 more)

### Community 61 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @docversity/types, @docversity/ui, @docversity/validation, @hookform/resolvers, lucide-react, motion, next (+8 more)

### Community 62 - "schemas.ts"
Cohesion: 0.03
Nodes (59): ColumnMapping, columnMappingSchema, CommitImport, commitImportSchema, fieldValuesSchema, IMPORT_ROW_FILTERS, IMPORT_SORT_FIELDS, ImportActions (+51 more)

### Community 63 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowJs, declaration, declarationMap, incremental, jsx, lib, module (+7 more)

### Community 64 - "Admin Registry Dashboard Screen"
Cohesion: 0.16
Nodes (16): Academic Session Selector, Admin Registry Dashboard Screen, Docversity Registrar Core, Generate Certificate Action, Global Search (Matric ID / Diploma Hash), Import Excel Action, KPI Stat Cards, Recent Certificates Panel (+8 more)

### Community 65 - "JsonLogger"
Cohesion: 0.22
Nodes (4): JsonLogger, LogSink, redact(), REDACTED

### Community 66 - "commit.test.ts"
Cohesion: 0.13
Nodes (35): config, validatedImport(), config, mixedWorkbook(), validated(), config, config, validWorkbook() (+27 more)

### Community 67 - "http-exception.filter.ts"
Cohesion: 0.12
Nodes (15): ErrorDetail, GlobalExceptionFilter, Translated, currentRequestContext(), currentRequestId(), REQUEST_ID_HEADER, RequestContext, storage (+7 more)

### Community 68 - "AuthContext"
Cohesion: 0.44
Nodes (9): MutationDocs(), ApiBody, ApiCreatedResponse, ApiOperation, Body, Post, AuthContext, CurrentAuth (+1 more)

### Community 69 - "Excel Bulk Import Validation Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "Docker Compose (local infra)"
Cohesion: 0.15
Nodes (17): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+9 more)

### Community 71 - "src/env.ts"
Cohesion: 0.08
Nodes (25): { IMPORT_MAX_FILE_MB }, nextConfig, rootEnvFile, securityHeaders, e2eDatabaseUrl, isCI, rootEnv, WebEnv (+17 more)

### Community 72 - "imports.test.tsx"
Cohesion: 0.21
Nodes (16): SessionProvider(), department, COUNTS, IMPORTER, EMPTY_PAGE, mockFetch(), REGISTRAR, renderWithProviders() (+8 more)

### Community 73 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+6 more)

### Community 74 - "status/page.tsx"
Cohesion: 0.18
Nodes (10): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), loadWebEnv(), config (+2 more)

### Community 75 - "academic.test.ts"
Cohesion: 0.13
Nodes (14): Create / update / skip policy, Validation, departmentQuerySchema, updateDepartmentSchema, createProgramSchema, createStudentSchema, normalizeRegistrationNumber(), packages_validation_src_index_createacademicsessionschema (+6 more)

### Community 76 - "Academic Trust Matrix design system"
Cohesion: 0.13
Nodes (25): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration, cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui) (+17 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "user-menu.tsx"
Cohesion: 0.11
Nodes (22): UserMenu(), signOut(), RowAction, LoginForm(), onSubmit(), textField(), ApiErrorBody, errorMessage() (+14 more)

### Community 79 - "RequirePermissions"
Cohesion: 0.19
Nodes (15): AcademicSessionsController, DashboardController, DepartmentsController, ProgramsController, RegistrationsController, StudentsController, ApiCookieAuth, ApiOkResponse (+7 more)

### Community 80 - "imports/package.json"
Cohesion: 0.05
Nodes (38): dependencies, @docversity/database, @docversity/storage, @docversity/types, @docversity/validation, exceljs, description, devDependencies (+30 more)

### Community 81 - "fixtures"
Cohesion: 0.30
Nodes (14): db, f, uid(), fixtures(), examContext(), examination(), issuedCertificate(), program() (+6 more)

### Community 82 - "imports/src/index.ts"
Cohesion: 0.14
Nodes (23): RFC-9562, transitionImportJob(), actionRequired(), buildErrorReport(), ReportRow, ReportSummary, text(), escapeSpreadsheetText() (+15 more)

### Community 83 - "ref_vitest"
Cohesion: 0.14
Nodes (8): auditFor(), Detail, newStudent(), testDb(), uniqueCode(), registrationsWith(), ref_node_crypto, ref_vitest

### Community 84 - "QR Document Scanner & Verifier Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "testing.ts"
Cohesion: 0.10
Nodes (19): "Registration 2025.xlsx" — column mapping report, What an import of this file needs (once authorised), calendarDate(), DateParse, FORMAT_HINT, pad(), parseDateCell(), parseDateText() (+11 more)

### Community 86 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Documentation Index"
Cohesion: 0.09
Nodes (23): Academic Masters API (Phase 4), Server-side relation resolution rules, Transactional student + registration creation, Imports API (`/api/v1/imports`), API Documentation, /api/v1 business endpoint prefix, Swagger / OpenAPI (generated), Zod schemas as single source of truth for OpenAPI (+15 more)

### Community 88 - "Architecture Overview"
Cohesion: 0.10
Nodes (27): Frontend Animation Rules, Framer Motion (default UI motion), GSAP (timeline-heavy special effects only), No animation in admin data views / verification results, Respect prefers-reduced-motion, Initial Stitch Migration Plan (archived), grading module (pure calculation engine), Planned NestJS backend module architecture (+19 more)

### Community 89 - "nestjs.json"
Cohesion: 0.20
Nodes (9): compilerOptions, emitDecoratorMetadata, experimentalDecorators, strictPropertyInitialization, verbatimModuleSyntax, display, extends, $schema (+1 more)

### Community 90 - "nest-cli.json"
Cohesion: 0.22
Nodes (8): collection, compilerOptions, builder, deleteOutDir, tsConfigPath, entryFile, $schema, sourceRoot

### Community 91 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, admin:create, build, clean, dev, lint, start, test (+1 more)

### Community 92 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, clean, dev, lint, start, test, test:e2e (+1 more)

### Community 93 - "app/layout.tsx"
Cohesion: 0.25
Nodes (6): inter, jakarta, metadata, viewport, apps_web_src_styles_globals, Toaster()

### Community 94 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 95 - "node.json"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, types, display, extends, ./base.json, $schema

### Community 96 - "documents/tsconfig.build.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 97 - "types/tsconfig.build.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 98 - "validation/tsconfig.build.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 99 - "ImportFileError"
Cohesion: 0.16
Nodes (13): ContainerEntry, ContainerLimits, inspectXlsxContainer(), OLE_SIGNATURE, verifyXlsxContainer(), openWorkbook(), readSource(), ImportFileError (+5 more)

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "student-rows.ts"
Cohesion: 0.10
Nodes (25): error(), FieldValues, indexRecords(), NormalizedStudentRow, PROTECTED_FIELDS, RawRowData, readText(), RecordIndex (+17 more)

### Community 102 - "ImportsService"
Cohesion: 0.17
Nodes (8): ImportsService, issues(), notNow(), parseFailure(), parseMapping(), parseSheets(), stateConflict(), Injectable

### Community 103 - "database/tsconfig.build.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, outDir, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 104 - "api/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/nestjs.json

### Community 105 - "(public)/page.tsx"
Cohesion: 0.33
Nodes (4): metadata, SERVICES, FadeIn(), motion

### Community 106 - "BullMQ worker on Redis (apps/worker)"
Cohesion: 0.13
Nodes (22): ADR-0002: Separate NestJS API instead of Next.js server logic, NestJS REST API (apps/api), Next.js as UI only (no direct DB/Redis/storage access), BullMQ worker on Redis (apps/worker), ADR-0006: Academic integrity rules enforced by PostgreSQL, Database-enforced integrity (CHECK constraints, triggers, partial unique indexes), Immutability of PUBLISHED results / ISSUED certificates; append-only audit logs, Prisma partialIndexes preview feature (+14 more)

### Community 107 - "database/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 108 - "documents/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 109 - "types/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 110 - "validation/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 111 - "imports.service.ts"
Cohesion: 0.04
Nodes (51): error, STEP_ERRORS, ACCEPTED_MIME_TYPES, DownloadFile, iso(), jobInclude, JobRow, STATUS_WORDS (+43 more)

### Community 112 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "test/registration-2025.test.ts"
Cohesion: 0.09
Nodes (27): ExistingRegistration, ReferenceData, StudentValidationContext, ARCHIVED, DEPT, existingRegistration(), INACTIVE_DEPT, INACTIVE_PROGRAM (+19 more)

### Community 114 - "development-fixtures.ts"
Cohesion: 0.17
Nodes (12): CreatePrismaClientOptions, packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prismaclient, DEV_FIXTURE_LABEL, PROGRAMS, seedDevelopmentFixtures(), SeedSummary, STUDENTS (+4 more)

### Community 115 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 116 - "@docversity/config shared tooling configuration"
Cohesion: 0.67
Nodes (3): @docversity/config shared tooling configuration, Shared ESLint configs (base/node/nextjs) + Prettier formatting, Shared TypeScript configs (base/node/nestjs/nextjs)

### Community 122 - "workbook.ts"
Cohesion: 0.16
Nodes (23): BLANK, cellDisplay(), dateToIso(), isRecord(), plainResult(), richText(), SourceCell, toSourceCell() (+15 more)

### Community 123 - "@nestjs/common"
Cohesion: 0.07
Nodes (54): AuditModule, Global, Module, AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY (+46 more)

### Community 124 - "storage/src/index.ts"
Cohesion: 0.23
Nodes (7): objectKeys, ObjectNotFoundError, ObjectTooLargeError, PutObjectOptions, S3ObjectStorageOptions, packages_validation_dist_index_storageenv, @aws-sdk/client-s3

### Community 125 - "TestOnlyController"
Cohesion: 0.29
Nodes (5): TestOnlyController, Controller, Get, HttpCode, Post

### Community 126 - "storage/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @aws-sdk/client-s3, @docversity/validation, description, exports, files, @docversity/config, @docversity/validation (+8 more)

### Community 127 - "student-fields.ts"
Cohesion: 0.18
Nodes (10): isSensitiveImportHeader(), normalizeImportHeader(), STUDENT_IMPORT_FIELD_KEYS, STUDENT_IMPORT_FIELDS, STUDENT_IMPORT_REQUIRED_FIELDS, studentImportField, StudentImportFieldDefinition, StudentImportFieldKind (+2 more)

### Community 128 - "Imports (Phase 5: students / registrations)"
Cohesion: 0.18
Nodes (11): Audit, Commit and idempotency, Flow, Imports (Phase 5: students / registrations), Known limitations, Limits and production tuning, Retries and failures, Security (+3 more)

### Community 129 - "CLAUDE.md — Docversity"
Cohesion: 0.15
Nodes (13): 10. Authentication boundaries, 11. Student import workflow (Phase 5), 12. API conventions, 13. Security and privacy rules (non-negotiable), 14. Development workflow and Git, 1. Product and status, 2. Monorepo, 3. Install and run (+5 more)

### Community 130 - "mapping.ts"
Cohesion: 0.25
Nodes (9): MappingProblem, validateStudentMapping(), columns(), sheet(), packages_validation_dist_index_importcolumn, packages_validation_dist_index_importmapping, packages_validation_dist_index_importmappingschema, packages_validation_dist_index_importsheet (+1 more)

### Community 131 - "registration-rules.ts"
Cohesion: 0.23
Nodes (11): AcademicSessionStatus, MasterDataStatus, checkRegistrationRelations(), issue(), RegistrationRelationInput, RegistrationRelationIssue, RegistrationRelationIssueCode, RegistrationRelationResult (+3 more)

### Community 132 - "S3ObjectStorage"
Cohesion: 0.18
Nodes (5): ADR-0009: A shared import engine package, run by the worker, with persisted state, Consequences, Context, Decision, S3ObjectStorage

### Community 133 - "ObjectStorage"
Cohesion: 0.22
Nodes (3): @docversity/storage, MemoryObjectStorage, ObjectStorage

### Community 135 - "nextjs.js"
Cohesion: 0.31
Nodes (6): nextjsConfig(), eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, ref_globals, @next/eslint-plugin-next

### Community 136 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, globals, @next/eslint-plugin-next (+1 more)

### Community 137 - "imports/tsconfig.build.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 138 - "storage/tsconfig.build.json"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 139 - "Student portal, profile changes and historic certificates — architecture (proposed)"
Cohesion: 0.28
Nodes (8): 1. Principles, 2. Student authentication boundary, 3. Proposed database additions (new migrations only), 4. Historic certificate handling, 5. Portal screens (planned), Activation (proving ownership), Student portal, profile changes and historic certificates — architecture (proposed), students()

### Community 140 - "exports"
Cohesion: 0.25
Nodes (8): exports, ./eslint/base, ./eslint/nextjs, ./eslint/node, ./typescript/base.json, ./typescript/nestjs.json, ./typescript/nextjs.json, ./typescript/node.json

### Community 141 - "imports/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 142 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, clean, dev, lint, test, typecheck

### Community 143 - "storage/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 144 - "prepare-test-database.ts"
Cohesion: 0.21
Nodes (11): checkDatabaseConnection(), createPrismaClient(), LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions, loadRootEnv(), ProvidedContext (+3 more)

### Community 145 - "base.js"
Cohesion: 0.40
Nodes (4): baseConfig(), eslint-config-prettier, @eslint/js, typescript-eslint

### Community 146 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @docversity/config, eslint, @types/node, typescript, vitest

### Community 147 - "Phase 6.5 — Student portal UI"
Cohesion: 0.25
Nodes (7): Student endpoints (student session; never staff), Development indicator investigation, Evidence, Phase 6.5 — Student portal UI, Phase boundary, Verification, StudentMe

### Community 148 - "enqueue-health-test.ts"
Cohesion: 0.11
Nodes (25): bullmqConnection(), createWorkers(), CreateWorkersOptions, importProcessor(), loadRootEnv(), loadWorkerEnv(), processHealthTestJob(), log() (+17 more)

### Community 149 - "database/src/index.ts"
Cohesion: 0.29
Nodes (9): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client_prisma, packages_database_src_generated_prisma_models (+1 more)

### Community 150 - "PasswordResetNotifier"
Cohesion: 0.22
Nodes (5): PASSWORD_RESET_NOTIFIER, PasswordResetNotifier, Injectable, UnconfiguredPasswordResetNotifier, TestAppOptions

### Community 151 - "create-admin-core.ts"
Cohesion: 0.23
Nodes (13): createAdmin(), CreateAdminError, CreateAdminInput, main(), prompt(), promptHidden(), rootEnv, ensureRoles() (+5 more)

### Community 152 - "ADR-0005: Toolchain baseline and version pins"
Cohesion: 0.27
Nodes (10): ADR-0001: pnpm workspaces + Turborepo monorepo, minimumReleaseAge supply-chain gate, pnpm workspaces, Turborepo task graph, ADR-0005: Toolchain baseline and version pins, allowBuilds install-script allow-list, Native ESM everywhere, Version pins (TS 6.0.3, Next 16.3.8, Prisma 7.10.0, ESLint 9.39.5, NestJS 12, Zod 4.6.5) (+2 more)

### Community 153 - "QueueModule"
Cohesion: 0.33
Nodes (4): QueueModule, Global, Inject, Module

### Community 154 - "Product Decisions Already Agreed"
Cohesion: 0.20
Nodes (14): Certificate architecture (draft → approve → issue → revoke/supersede), TECHNICAL-AUDIT.md (legacy WordPress audit), Product Decisions Already Agreed, Historic QR compatibility (legacy verify.thedocversity.com URLs), Legacy WordPress verification system, One authoritative certificate record, Public result lookup (registration number + unconfirmed second identifier), Certificate numbering format (open question) (+6 more)

### Community 155 - "students/api.ts"
Cohesion: 0.17
Nodes (11): studentKeys, studentsApi, packages_validation_dist_index_activitylistschema, packages_validation_dist_index_createregistration, packages_validation_dist_index_createstudent, packages_validation_dist_index_registrationschema, packages_validation_dist_index_studentdetailschema, packages_validation_dist_index_studentlistschema (+3 more)

### Community 156 - "ZodValidationPipe"
Cohesion: 0.20
Nodes (6): CsrfGuard, Injectable, PermissionsGuard, Injectable, ZodValidationPipe, 6. Backend conventions (apps/api)

### Community 157 - "getStudentSessionState"
Cohesion: 0.19
Nodes (10): metadata, Page(), StudentPortalLayout(), metadata, StudentHomePage(), metadata, Page(), StudentCourses() (+2 more)

### Community 158 - "AuthService"
Cohesion: 0.25
Nodes (3): Inject, AuthService, Injectable

### Community 159 - "dashboard.service.ts"
Cohesion: 0.29
Nodes (4): DashboardService, Injectable, packages_types_dist_index_academic_audit_actions, packages_validation_dist_index_dashboard

### Community 160 - "database.module.ts"
Cohesion: 0.50
Nodes (3): DatabaseModule, Global, Module

## Ambiguous Edges - Review These
- `Six-Step Import Wizard Stepper` → `Registry Pipeline v2.4`  [AMBIGUOUS]
  references/stitch/stitch_docversity_ui_ux_design_system/excel_bulk_import_validation/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **1220 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+1215 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1584 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CLAUDE.md — Docversity` connect `CLAUDE.md — Docversity` to `ref_react`, `ZodValidationPipe`, `Documentation Index`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `6. Backend conventions (apps/api)` connect `ZodValidationPipe` to `CLAUDE.md — Docversity`, `registration-rules.ts`, `common.ts`, `SessionStore`, `auth.service.ts`, `auth.controller.ts`, `@nestjs/common`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `@nestjs/common` connect `@nestjs/common` to `api/test/helpers.ts`, `student-accounts.controller.ts`, `packages_types_dist_index`, `auth.service.ts`, `academic.controllers.ts`, `auth.controller.ts`, `PasswordResetNotifier`, `app.setup.ts`, `dashboard.service.ts`, `database.module.ts`, `api/package.json`, `health.service.ts`, `ref_zod`, `student-auth/support.ts`, `JsonLogger`, `commit.test.ts`, `http-exception.filter.ts`, `ref_vitest`, `imports.service.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _1220 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_react` be split into smaller, more focused modules?**
  _Cohesion score 0.07758620689655173 - nodes in this community are weakly interconnected._
- **Should `student-accounts/schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._