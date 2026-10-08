# Graph Report - docversity  (2026-10-09)

## Corpus Check
- 520 files · ~641,929 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 4226 nodes · 10483 edges · 183 communities (168 shown, 15 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 338 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `47a64ea5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- programs-view.tsx
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
- curriculum-editor-view.tsx
- PrismaService
- student-auth.controller.ts
- worker/package.json
- students.ts
- academic.controllers.ts
- support/db.ts
- auth.controller.ts
- StudentContext
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
- packages_types_dist_index
- student-accounts-view.tsx
- health.service.ts
- env.test.ts
- .activate
- SessionStore
- Frontend
- documents/package.json
- getStudentSessionState
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
- academic-sessions.service.ts
- AuthContext
- Excel Bulk Import Validation Screen
- DOCVERSITY README
- verify-curriculum-upgrade.mjs
- curricula.test.tsx
- devDependencies
- lib/env.ts
- academic.test.ts
- Academic Trust Matrix design system
- compilerOptions
- next
- RequirePermissions
- imports/package.json
- fixtures
- imports/src/index.ts
- academic/curricula.test.ts
- QR Document Scanner & Verifier Screen
- curricula.ts
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
- testing.ts
- web/tsconfig.json
- student-rows.ts
- .findJob
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
- curricula.controllers.ts
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
- students
- exports
- imports/tsconfig.json
- scripts
- storage/tsconfig.json
- client.ts
- base.js
- devDependencies
- Phase 6.5 — Student portal UI
- enqueue-health-test.ts
- database/src/index.ts
- PasswordResetNotifier
- create-admin-core.ts
- student-profile/schemas.ts
- app.module.ts
- MutationDocs
- profile-requests.service.ts
- .writeAuditEvent
- AppError
- departments.service.ts
- ProfileRequestsService
- programs.ts
- imports.controller.ts
- programs.service.ts
- profile-request-detail-view.tsx
- profile-requests.test.ts
- .submit
- ImportsService
- src/env.ts
- API Documentation
- profile-photo.ts
- StudentProfileController
- schema/curricula.test.ts
- limits.ts
- error-response.schema.ts
- PhotoUploadInterceptor
- setup.ts
- GLOSSARY.md
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_js
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_passwordservice
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_createadmin
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_js
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_ensureroles
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_js

## God Nodes (most connected - your core abstractions)
1. `cn()` - 114 edges
2. `@nestjs/common` - 95 edges
3. `next` - 77 edges
4. `RequirePermissions()` - 70 edges
5. `AuthContext` - 55 edges
6. `errorMessage()` - 51 edges
7. `ApiConfig` - 48 edges
8. `Button()` - 46 edges
9. `CurrentAuth` - 45 edges
10. `PrismaService` - 41 edges

## Surprising Connections (you probably didn't know these)
- `Consequences` --references--> `StudentRoute()`  [INFERRED]
  docs/decisions/ADR-0010-student-authentication.md → apps/api/src/student-auth/student-auth.decorators.ts
- `Retries and failures` --references--> `ImportFileError`  [INFERRED]
  docs/architecture/imports.md → packages/imports/src/errors.ts
- `6. Backend conventions (apps/api)` --references--> `AuthGuard`  [INFERRED]
  CLAUDE.md → apps/api/src/auth/auth.guard.ts
- `6. Backend conventions (apps/api)` --references--> `CsrfGuard`  [INFERRED]
  CLAUDE.md → apps/api/src/auth/csrf.guard.ts
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

## Communities (183 total, 15 thin omitted)

### Community 0 - "programs-view.tsx"
Cohesion: 0.06
Nodes (50): metadata, metadata, metadata, metadata, metadata, FilterSelect(), Pagination(), SearchInput() (+42 more)

### Community 1 - "student-accounts/schemas.ts"
Cohesion: 0.06
Nodes (31): ACTIVATION_CODE_ALPHABET, ACTIVATION_CODE_LENGTH, activationCodeInput, IssueActivationCodes, issueActivationCodesSchema, IssuedActivationCodes, issuedActivationCodesSchema, passwordInput (+23 more)

### Community 2 - "ImportsController"
Cohesion: 0.16
Nodes (21): download(), ImportsController, StepDocs(), ApiBody, ApiConsumes, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse (+13 more)

### Community 3 - "config/package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, eslint, eslint, globals, typescript, name, peerDependencies (+7 more)

### Community 4 - "packages_validation_dist_index"
Cohesion: 0.09
Nodes (62): Field(), SelectField(), applyServerErrors(), EMPTY, curriculaApi, useCurriculumMutation(), AssignmentDialog(), SubjectPicker() (+54 more)

### Community 5 - "cn"
Cohesion: 0.04
Nodes (79): AdminBreadcrumbs(), NavLinks(), sidebarPreference, useBreadcrumbLabel(), ADMIN_NAV, AdminNavItem, isNavActive(), SEGMENT_LABELS (+71 more)

### Community 6 - "common.ts"
Cohesion: 0.05
Nodes (48): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSession, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema (+40 more)

### Community 7 - "ui/package.json"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "mapping-panel.tsx"
Cohesion: 0.13
Nodes (26): getError(), selectValue(), useSessionOptions(), useActiveDepartmentOptions(), DATE_FORMATS, initialSheet(), AUTOMATIC_LABEL, DefaultSessionSelect() (+18 more)

### Community 9 - "api/test/helpers.ts"
Cohesion: 0.12
Nodes (31): attempt(), config, postPreAuth(), as(), attemptsFromForwardedIps(), healthWith(), Agent, browser() (+23 more)

### Community 10 - "student-accounts.controller.ts"
Cohesion: 0.07
Nodes (28): PermissionsGuard, Injectable, openApiRequestSchema(), ZodValidationPipe, error, StudentAccountsModule, Module, RegistrationRow (+20 more)

### Community 11 - "database/package.json"
Cohesion: 0.05
Nodes (41): dependencies, @prisma/adapter-pg, @prisma/client, description, devDependencies, @docversity/config, eslint, prisma (+33 more)

### Community 12 - "curriculum-editor-view.tsx"
Cohesion: 0.05
Nodes (58): metadata, metadata, metadata, BreadcrumbLabelProvider(), LabelContext, Setter, useSetBreadcrumbLabel(), initials() (+50 more)

### Community 13 - "PrismaService"
Cohesion: 0.07
Nodes (20): AcademicModule, Module, AcademicSessionsService, Injectable, DashboardService, Injectable, RegistrationsService, Injectable (+12 more)

### Community 14 - "student-auth.controller.ts"
Cohesion: 0.06
Nodes (33): Inject, readCookie(), summariseUserAgent(), IdentifierHasher, Inject, Injectable, ARGON2_PARAMETERS, PasswordService (+25 more)

### Community 15 - "worker/package.json"
Cohesion: 0.05
Nodes (42): dependencies, bullmq, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation, ioredis (+34 more)

### Community 16 - "students.ts"
Cohesion: 0.06
Nodes (36): curriculumRefSchema, ActivityList, activityListSchema, CreateRegistration, CreateRegistrationInput, createRegistrationSchema, CreateStudent, CreateStudentInput (+28 more)

### Community 17 - "academic.controllers.ts"
Cohesion: 0.06
Nodes (46): error, MUTATION_ERRORS, REGISTRATION_NUMBER_CONFLICT, registrationInclude, RegistrationRow, PERSONAL_FIELDS, studentKeys, studentsApi (+38 more)

### Community 18 - "support/db.ts"
Cohesion: 0.15
Nodes (16): packages_database_src_index_prismaclient, db, f, db, f, db, f, db (+8 more)

### Community 19 - "auth.controller.ts"
Cohesion: 0.11
Nodes (35): ApiAcceptedResponse, AuthController, errorResponse, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse (+27 more)

### Community 20 - "StudentContext"
Cohesion: 0.38
Nodes (8): ApiQuery, CurrentStudent, StudentContext, ApiOperation, ApiProduces, Get, Param, Res

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
Cohesion: 0.07
Nodes (30): API_ROUTE_PREFIX, configureApp(), installNotFoundFallback(), LOG_LEVELS, logLevelsFor(), OPENAPI_JSON_PATH, SWAGGER_PATH, CSRF_HEADER (+22 more)

### Community 26 - "activity.ts"
Cohesion: 0.22
Nodes (11): AuditRow, count(), FIELD_LABELS, fields(), plural(), status(), summarizeAudit(), viaImport() (+3 more)

### Community 27 - "web/package.json"
Cohesion: 0.07
Nodes (28): description, @docversity/config, @docversity/database, @docversity/imports, @docversity/types, @docversity/validation, eslint, globals (+20 more)

### Community 28 - "import-detail-view.tsx"
Cohesion: 0.06
Nodes (49): metadata, metadata, DataTable(), ErrorState(), importKeys, importsApi, RUNNING_STATUSES, useImportCreators() (+41 more)

### Community 29 - "tasks"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "coming-soon.tsx"
Cohesion: 0.10
Nodes (9): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+1 more)

### Community 31 - "Authentication"
Cohesion: 0.10
Nodes (33): Redis 7.4 service, Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Login rate limiting (fixed-window Redis counters), Password reset (single-use token in URL fragment), Redis unavailable → fail closed (503) (+25 more)

### Community 32 - "Database Documentation"
Cohesion: 0.07
Nodes (46): Academic audit events (safe metadata), Transactional student + registration creation, Standard error envelope (code, message, requestId), Correlation IDs and redacted JSON logs, Initial Stitch Migration Plan (archived), ADR-0006 Database-enforced integrity, Certificate architecture (draft → approve → issue → revoke/supersede), Excel import architecture (upload → map → validate → commit) (+38 more)

### Community 33 - "types/package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "api/package.json"
Cohesion: 0.07
Nodes (29): description, bullmq, @docversity/config, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+21 more)

### Community 35 - "packages_types_dist_index"
Cohesion: 0.12
Nodes (21): metadata, metadata, metadata, PageHeader(), ForbiddenState(), SessionContext, useSessionUser(), DashboardView() (+13 more)

### Community 36 - "student-accounts-view.tsx"
Cohesion: 0.05
Nodes (50): metadata, QueryProvider(), studentAccountKeys, useInvalidate(), useIssueCodes(), useRevokeCodes(), useSetAccountStatus(), useStudentAccounts() (+42 more)

### Community 37 - "health.service.ts"
Cohesion: 0.06
Nodes (26): ApiServiceUnavailableResponse, PasswordResetStore, Inject, Injectable, Inject, Inject, TimeoutError, withTimeout() (+18 more)

### Community 38 - "env.test.ts"
Cohesion: 0.11
Nodes (18): EnvValidationError, parseEnv(), envBoolean, httpUrl, logLevelSchema, nodeEnvSchema, port, DatabaseEnv (+10 more)

### Community 39 - ".activate"
Cohesion: 0.18
Nodes (19): clientInfo(), StudentAuthController, StudentController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse (+11 more)

### Community 40 - "SessionStore"
Cohesion: 0.11
Nodes (13): AuthGuard, Inject, Injectable, assertPasswordPolicy(), AuthService, toAuthUser(), Injectable, sha256() (+5 more)

### Community 41 - "Frontend"
Cohesion: 0.10
Nodes (28): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Authentication endpoints (/api/v1/auth/*), Frontend, AdminShell (protected admin layout), Frontend Animation Rules, Framer Motion (default UI motion) (+20 more)

### Community 42 - "documents/package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "getStudentSessionState"
Cohesion: 0.12
Nodes (20): metadata, StudentLoginPage(), StudentPortalLayout(), metadata, StudentHomePage(), Page(), metadata, Page() (+12 more)

### Community 44 - "server-auth.ts"
Cohesion: 0.13
Nodes (15): AdminLoginPage(), ProtectedAdminLayout(), metadata, Page(), AdminShell(), getSessionState(), getStudentCurriculum, SESSION_COOKIES (+7 more)

### Community 45 - "validation/src/index.ts"
Cohesion: 0.13
Nodes (11): HealthResponse, healthResponseSchema, HealthServiceName, ServiceStatus, serviceStatusSchema, packages_validation_src_index_healthresponseschema, HEALTH_TEST_DEFAULT_MESSAGE, HealthTestJobData (+3 more)

### Community 46 - "student-pages.tsx"
Cohesion: 0.11
Nodes (14): metadata, metadata, metadata, metadata, metadata, CLASSIFICATION, PLANNED_MODULES, RegistrationCurriculum (+6 more)

### Community 47 - "student-overview.tsx"
Cohesion: 0.13
Nodes (23): STATUS_LABELS, isStudentNavActive(), primaryRegistration(), StudentNavHref, StudentNavItem, StudentSubpageHref, DetailList(), PageIntro() (+15 more)

### Community 48 - ".issue"
Cohesion: 0.13
Nodes (18): StudentAccountsController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity, ApiTags (+10 more)

### Community 49 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+11 more)

### Community 50 - "Institutional Certificate Registry"
Cohesion: 0.14
Nodes (20): Academic Session Selector & Global Search, Arweave Decentralized Storage Node, Audit Trail (Verification Queries), Certificate Revocation / Disciplinary Annulment, Certificate Status Lifecycle (Issued, Pending Sign-off, Revoked), Credential Status KPI Cards, Degree Certificate Parchment Template, Foil & Watermark Physical Security (+12 more)

### Community 51 - "e2e/support.ts"
Cohesion: 0.16
Nodes (22): addNewSubject(), choose(), createCourse(), shared, SERVICES, issueCode(), openRequest(), staffPage() (+14 more)

### Community 52 - "Public Verification Portal Home Screen"
Cohesion: 0.13
Nodes (19): Bulk Verification & Institutional Access (Enterprise Gateway), Certificate Serial Format DOC-[YEAR]-[SERIAL], Certificate Verification (Conferrals & Degrees), Certified PDF Attestation (sealed PDF with audit trail and verification token), Check Results (Transcripts & Grades), Authenticated Credentials Stats Banner (148,290+ issued, 100% official, instant), Docversity Academic Registry, FERPA & GDPR Compliance (+11 more)

### Community 53 - "CsrfService"
Cohesion: 0.14
Nodes (10): Inject, CsrfGuard, normalizeOrigin(), Inject, Injectable, CsrfService, Inject, Injectable (+2 more)

### Community 54 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @axe-core/playwright, @docversity/config, @docversity/database, @docversity/imports, eslint, globals, jsdom (+11 more)

### Community 55 - "engine.ts"
Cohesion: 0.08
Nodes (56): appendAudit(), chunks(), computeRowCounts(), dateOnly(), Db, ExistingRow, existingSelect, fromDateOnly() (+48 more)

### Community 56 - "prepare-e2e.mjs"
Cohesion: 0.11
Nodes (18): apps_api_dist_auth_password_service, apps_api_dist_auth_password_service_passwordservice, apps_api_dist_cli_create_admin_core, apps_api_dist_cli_create_admin_core_createadmin, apps_api_dist_cli_roles, apps_api_dist_cli_roles_ensureroles, loadRootEnv(), ProvidedContext (+10 more)

### Community 57 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 58 - "Academic Result Verification Detail Screen"
Cohesion: 0.16
Nodes (17): Institutional Academic Ledger (Folio), Academic Result Verification Detail Screen, Authenticated Transcript Header Card, Office of the Controller of Examinations, Docversity UI/UX Design System (navy/blue institutional palette, card layout), Docversity Registry Footer (Verification Services, Institutional Governance, ISO 27001, FERPA/GDPR), Institutional Verification Code (Hash), Statement of Marks & Credits Table (+9 more)

### Community 59 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, bullmq, cookie, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+12 more)

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
Cohesion: 0.11
Nodes (38): auditFor(), testDb(), config, registrationsWith(), validatedImport(), config, mixedWorkbook(), validated() (+30 more)

### Community 67 - "academic-sessions.service.ts"
Cohesion: 0.10
Nodes (22): CODE_CONFLICT, include, SessionRow, FIELD_PATHS, RelationInput, ResolvedRelations, CODE_CONFLICT, historyUsage (+14 more)

### Community 68 - "AuthContext"
Cohesion: 0.42
Nodes (8): ApiBody, ApiCreatedResponse, ApiOperation, Body, Patch, Post, AuthContext, CurrentAuth

### Community 69 - "Excel Bulk Import Validation Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "DOCVERSITY README"
Cohesion: 0.12
Nodes (25): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+17 more)

### Community 71 - "verify-curriculum-upgrade.mjs"
Cohesion: 0.08
Nodes (22): { IMPORT_MAX_FILE_MB }, nextConfig, rootEnvFile, securityHeaders, e2eDatabaseUrl, isCI, rootEnv, rootEnvFile (+14 more)

### Community 72 - "curricula.test.tsx"
Cohesion: 0.13
Nodes (27): CURRICULUM_ADMIN, program, READER, serveCurriculum(), department, COUNTS, IMPORTER, detail (+19 more)

### Community 73 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+6 more)

### Community 74 - "lib/env.ts"
Cohesion: 0.12
Nodes (16): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), loadWebEnv(), WebEnv (+8 more)

### Community 75 - "academic.test.ts"
Cohesion: 0.08
Nodes (24): Audit, Commit and idempotency, Create / update / skip policy, Flow, Imports (Phase 5: students / registrations), Known limitations, Limits and production tuning, Retries and failures (+16 more)

### Community 76 - "Academic Trust Matrix design system"
Cohesion: 0.13
Nodes (25): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration, cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui) (+17 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "next"
Cohesion: 0.17
Nodes (13): metadata, metadata, UserMenu(), signOut(), LoginForm(), onSubmit(), textField(), ApiErrorBody (+5 more)

### Community 79 - "RequirePermissions"
Cohesion: 0.21
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

### Community 83 - "academic/curricula.test.ts"
Cohesion: 0.31
Nodes (11): activeCurriculum(), add(), course(), curriculum(), detailOf(), registrationIn(), subject(), Detail (+3 more)

### Community 84 - "QR Document Scanner & Verifier Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "curricula.ts"
Cohesion: 0.03
Nodes (68): ACADEMIC_STRUCTURES, AcademicStructure, AddCurriculumSubject, AddCurriculumSubjectInput, addCurriculumSubjectSchema, AssessmentComponent, assessmentComponentSchema, AssignCurriculum (+60 more)

### Community 86 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Documentation Index"
Cohesion: 0.08
Nodes (20): Assignment and lifecycle, Course curricula (Phase 7B), Validation, roles and audit, Knowledge graph (graphify), Regenerating, Evidence and verification, Historical integrity and migrations, Implemented (+12 more)

### Community 88 - "Architecture Overview"
Cohesion: 0.11
Nodes (25): Student photo upload deferred, Architecture Overview, ADR-0002 Separate API, ADR-0003 Background worker, ADR-0004 Object storage, ADR-0005 Toolchain baseline, API enqueues heavy jobs to worker via Redis, Browser talks to Next.js only (+17 more)

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
Cohesion: 0.22
Nodes (7): inter, jakarta, metadata, viewport, apps_web_src_styles_globals, STATUS_COLOURS, Toaster()

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

### Community 99 - "testing.ts"
Cohesion: 0.08
Nodes (25): "Registration 2025.xlsx" — column mapping report, What an import of this file needs (once authorised), ContainerEntry, ContainerLimits, inspectXlsxContainer(), OLE_SIGNATURE, verifyXlsxContainer(), openWorkbook() (+17 more)

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "student-rows.ts"
Cohesion: 0.09
Nodes (32): calendarDate(), DateParse, FORMAT_HINT, pad(), parseDateCell(), parseDateText(), error(), existingValues() (+24 more)

### Community 102 - ".findJob"
Cohesion: 0.29
Nodes (6): iso(), notNow(), parseFailure(), parseMapping(), parseSheets(), stateConflict()

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
Cohesion: 0.11
Nodes (26): ADR-0002: Separate NestJS API instead of Next.js server logic, NestJS REST API (apps/api), Next.js as UI only (no direct DB/Redis/storage access), ADR-0003: Long-running work runs in a BullMQ worker, BullMQ worker on Redis (apps/worker), health-test job on system queue, Idempotent at-least-once jobs, ADR-0006: Academic integrity rules enforced by PostgreSQL (+18 more)

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
Cohesion: 0.07
Nodes (26): ACCEPTED_MIME_TYPES, jobInclude, JobRow, STATUS_WORDS, userRef, IMPORT_QUEUE, packages_imports_dist_index_buildstudenttemplate, packages_imports_dist_index_celldisplay (+18 more)

### Community 112 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "test/registration-2025.test.ts"
Cohesion: 0.09
Nodes (27): ExistingRegistration, ReferenceData, StudentValidationContext, ARCHIVED, DEPT, existingRegistration(), INACTIVE_DEPT, INACTIVE_PROGRAM (+19 more)

### Community 114 - "development-fixtures.ts"
Cohesion: 0.19
Nodes (10): DEV_FIXTURE_LABEL, PROGRAMS, seedDevelopmentFixtures(), SeedSummary, STUDENTS, SUBJECTS, db, LOCAL_HOSTS (+2 more)

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
Cohesion: 0.10
Nodes (37): AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY, CsrfMode, PERMISSIONS_KEY, ClientInfo (+29 more)

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

### Community 128 - "curricula.controllers.ts"
Cohesion: 0.05
Nodes (52): error, NOT_EDITABLE, ASSIGNMENT_ORDER, AssignmentRow, componentsJson(), componentsOf(), detailInclude, DetailRow (+44 more)

### Community 129 - "CLAUDE.md — Docversity"
Cohesion: 0.14
Nodes (14): 10. Authentication boundaries, 10a. Student profile change requests (Phase 7), 11. Student import workflow (Phase 5), 12. API conventions, 13. Security and privacy rules (non-negotiable), 14. Development workflow and Git, 1. Product and status, 2. Monorepo (+6 more)

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
Cohesion: 0.20
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

### Community 139 - "students"
Cohesion: 0.10
Nodes (21): Approval, Student endpoints (student session cookie + student CSRF token), Student profile change requests (Phase 7), 1. Principles, 2. Student authentication boundary, 3. Proposed database additions (new migrations only), 4. Historic certificate handling, 5. Portal screens (planned) (+13 more)

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

### Community 144 - "client.ts"
Cohesion: 0.18
Nodes (13): checkDatabaseConnection(), createPrismaClient(), CreatePrismaClientOptions, LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions, loadRootEnv() (+5 more)

### Community 145 - "base.js"
Cohesion: 0.40
Nodes (4): baseConfig(), eslint-config-prettier, @eslint/js, typescript-eslint

### Community 146 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @docversity/config, eslint, @types/node, typescript, vitest

### Community 147 - "Phase 6.5 — Student portal UI"
Cohesion: 0.17
Nodes (10): Staff endpoints, Student endpoints (student session; never staff), Student portal & student accounts API, Development indicator investigation, Evidence, Phase 6.5 — Student portal UI, Phase boundary, Review polish (before merge) (+2 more)

### Community 148 - "enqueue-health-test.ts"
Cohesion: 0.15
Nodes (18): bullmqConnection(), createWorkers(), CreateWorkersOptions, importProcessor(), processHealthTestJob(), processSystemJob(), connection, deadline (+10 more)

### Community 149 - "database/src/index.ts"
Cohesion: 0.23
Nodes (11): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prisma (+3 more)

### Community 150 - "PasswordResetNotifier"
Cohesion: 0.25
Nodes (4): PasswordResetNotifier, Injectable, UnconfiguredPasswordResetNotifier, TestAppOptions

### Community 151 - "create-admin-core.ts"
Cohesion: 0.19
Nodes (14): createAdmin(), CreateAdminError, CreateAdminInput, main(), prompt(), promptHidden(), rootEnv, ensureRoles() (+6 more)

### Community 152 - "student-profile/schemas.ts"
Cohesion: 0.05
Nodes (38): approveProfileRequestSchema, fieldChangeSchema, GENDER_OPTIONS, isPlausibleDateOfBirth(), MAX_STUDENT_AGE_YEARS, MIN_STUDENT_AGE_YEARS, photoInfoSchema, PROFILE_FIELD_LABELS (+30 more)

### Community 153 - "app.module.ts"
Cohesion: 0.05
Nodes (36): AppModule, Module, AuditModule, Global, Module, AuthModule, Global, Module (+28 more)

### Community 154 - "MutationDocs"
Cohesion: 0.19
Nodes (21): MutationDocs(), CurriculaController, ProgramCurriculaController, StudentCurriculumController, SubjectsController, ApiBody, ApiCookieAuth, ApiCreatedResponse (+13 more)

### Community 155 - "profile-requests.service.ts"
Cohesion: 0.08
Nodes (28): error, ACTION_SUMMARIES, PhotoFile, ProfileSnapshot, requestInclude, RequestWithRelations, StudentRow, packages_database_dist_index_uniqueconstraintname (+20 more)

### Community 156 - ".writeAuditEvent"
Cohesion: 0.15
Nodes (11): toSession(), toDepartment(), resolveRegistrationRelations(), toRegistration(), SubjectsService, toSubject(), Injectable, changedFields() (+3 more)

### Community 157 - "AppError"
Cohesion: 0.18
Nodes (7): CurriculaService, notEditable(), num(), overlap(), Injectable, AppError, invalidRelation()

### Community 158 - "departments.service.ts"
Cohesion: 0.12
Nodes (12): CODE_CONFLICT, DepartmentRow, DepartmentsService, include, Injectable, pageArgs(), paginationMeta(), packages_validation_dist_index_createdepartment (+4 more)

### Community 159 - "ProfileRequestsService"
Cohesion: 0.16
Nodes (10): UploadedPhoto, conflict(), notPending(), pendingExists(), ProfileRequestsService, proposedOf(), snapshotFromJson(), snapshotOf() (+2 more)

### Community 160 - "programs.ts"
Cohesion: 0.08
Nodes (22): 10b. Course and curriculum management (Phase 7B), academicStructureSchema, durationUnitSchema, MAX_ACADEMIC_PERIODS, Subject, CreateProgram, CreateProgramInput, createProgramSchema (+14 more)

### Community 161 - "imports.controller.ts"
Cohesion: 0.09
Nodes (20): error, RowNumberPipe, STEP_ERRORS, DownloadFile, XLSX_CONTENT_TYPE, UploadRequest, packages_validation_dist_index_commitimport, packages_validation_dist_index_commitimportschema (+12 more)

### Community 162 - "programs.service.ts"
Cohesion: 0.15
Nodes (14): assertActiveDepartment(), CODE_CONFLICT, include, legacySemesters(), ProgramRow, ProgramsService, structureOf(), toProgram() (+6 more)

### Community 163 - "profile-request-detail-view.tsx"
Cohesion: 0.18
Nodes (13): metadata, profileRequestKeys, profileRequestPhotoUrl(), profileRequestsApi, useApproveProfileRequest(), useInvalidateAfterDecision(), useProfileRequest(), useRejectProfileRequest() (+5 more)

### Community 164 - "profile-requests.test.ts"
Cohesion: 0.16
Nodes (14): storage, student(), Agent, cancelRequest(), detailOf(), images, PhotoPart, studentRequestOf() (+6 more)

### Community 165 - ".submit"
Cohesion: 0.21
Nodes (13): PhotoUploadRequest, parseSubmission(), ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiSecurity (+5 more)

### Community 166 - "ImportsService"
Cohesion: 0.16
Nodes (4): ImportsService, issues(), Injectable, UploadedWorkbook

### Community 167 - "src/env.ts"
Cohesion: 0.18
Nodes (13): loadRootEnv(), loadWorkerEnv(), WorkerEnv, workerEnvSchema, log(), main(), packages_database_dist_index_createprismaclient, packages_storage_dist_index_s3objectstorage (+5 more)

### Community 168 - "API Documentation"
Cohesion: 0.23
Nodes (12): Academic Masters API (Phase 4), Paginated list contract (page, pageSize, sortBy allow-list), No-deletes rule (deactivate via status), Server-side relation resolution rules, API Documentation, /api/v1 business endpoint prefix, Swagger / OpenAPI (generated), Zod schemas as single source of truth for OpenAPI (+4 more)

### Community 169 - "profile-photo.ts"
Cohesion: 0.33
Nodes (6): FORMATS, imageContentType(), invalid(), ProcessedPhoto, processProfilePhoto(), packages_validation_dist_index_profile_photo_rules

### Community 170 - "StudentProfileController"
Cohesion: 0.38
Nodes (5): ProfileRequestsController, StudentProfileController, ApiCookieAuth, ApiTags, Controller

### Community 171 - "schema/curricula.test.ts"
Cohesion: 0.40
Nodes (3): db, draftCurriculum(), f

### Community 172 - "limits.ts"
Cohesion: 0.40
Nodes (4): ImportLimitsEnv, importLimitsEnvSchema, QueueEnv, queueEnvSchema

### Community 173 - "error-response.schema.ts"
Cohesion: 0.40
Nodes (4): ERROR_CODES, ErrorCode, ErrorResponse, errorResponseSchema

## Ambiguous Edges - Review These
- `Six-Step Import Wizard Stepper` → `Registry Pipeline v2.4`  [AMBIGUOUS]
  references/stitch/stitch_docversity_ui_ux_design_system/excel_bulk_import_validation/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **1417 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+1412 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1847 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CLAUDE.md — Docversity` connect `CLAUDE.md — Docversity` to `programs.ts`, `student-accounts.controller.ts`, `student-accounts-view.tsx`, `Documentation Index`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `6. Backend conventions (apps/api)` connect `student-accounts.controller.ts` to `CLAUDE.md — Docversity`, `registration-rules.ts`, `common.ts`, `SessionStore`, `student-auth.controller.ts`, `CsrfService`, `AppError`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `programs-view.tsx`, `packages_types_dist_index`, `profile-request-detail-view.tsx`, `student-accounts-view.tsx`, `cn`, `verify-curriculum-upgrade.mjs`, `packages_validation_dist_index`, `(public)/page.tsx`, `lib/env.ts`, `getStudentSessionState`, `server-auth.ts`, `curriculum-editor-view.tsx`, `student-pages.tsx`, `student-overview.tsx`, `web/package.json`, `import-detail-view.tsx`, `app/layout.tsx`, `coming-soon.tsx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _1417 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `programs-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0560126582278481 - nodes in this community are weakly interconnected._
- **Should `student-accounts/schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._