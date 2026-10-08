# Graph Report - docversity  (2026-10-08)

## Corpus Check
- 452 files · ~386,742 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 3523 nodes · 8230 edges · 160 communities (154 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 253 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `947245ee`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- student-accounts-view.tsx
- student-accounts/schemas.ts
- RequirePermissions
- config/package.json
- button.tsx
- ref_react
- common.ts
- ui/package.json
- health.service.ts
- api/test/helpers.ts
- student-accounts.controller.ts
- database/package.json
- academic.controllers.ts
- packages_validation_dist_index
- .writeAuditEvent
- worker/package.json
- students.ts
- src/env.ts
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
- next
- Authentication
- Database Documentation
- types/package.json
- api/package.json
- programs/api.ts
- lib/api.ts
- @nestjs/common
- env.test.ts
- .activate
- SessionStore
- Frontend
- documents/package.json
- value-maps.tsx
- create-admin-core.ts
- validation/src/index.ts
- api/src/main.ts
- UsersService
- .issue
- compilerOptions
- Institutional Certificate Registry
- e2e/support.ts
- Public Verification Portal Home Screen
- CsrfService
- devDependencies
- engine.ts
- students/api.ts
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
- Documentation Index
- AuthContext
- Excel Bulk Import Validation Screen
- DOCVERSITY README
- lib/env.ts
- imports.test.tsx
- devDependencies
- status/page.tsx
- academic.test.ts
- Academic Trust Matrix design system
- compilerOptions
- cn
- ApiOkResponse
- imports/package.json
- fixtures
- imports/src/index.ts
- academic-sessions.ts
- QR Document Scanner & Verifier Screen
- testing.ts
- compilerOptions
- Initial Stitch Migration Plan (archived)
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
- app.module.ts
- storage/src/index.ts
- TestOnlyController
- storage/package.json
- student-fields.ts
- Imports (Phase 5: students / registrations)
- scripts
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
- prepare-e2e.mjs
- create-workers.ts
- database/src/index.ts
- ref_vitest
- ref_node_url
- ADR-0005: Toolchain baseline and version pins
- academic-sessions/api.ts
- departments/api.ts
- processors.ts
- enqueue-health-test.ts
- devDependencies
- .getHealth
- ADR-0010: Students are a separate principal, activated with university-issued codes

## God Nodes (most connected - your core abstractions)
1. `cn()` - 102 edges
2. `@nestjs/common` - 84 edges
3. `next` - 52 edges
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
- `2. Student authentication boundary` --references--> `StudentAuthGuard`  [INFERRED]
  docs/architecture/student-portal-and-documents.md → apps/api/src/student-auth/student-auth.guard.ts
- `Decision` --references--> `ObjectStorage`  [INFERRED]
  docs/decisions/ADR-0009-import-engine.md → packages/storage/src/object-storage.ts
- `Validation` --references--> `checkRegistrationRelations()`  [INFERRED]
  docs/architecture/imports.md → packages/validation/src/academic/registration-rules.ts

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

## Communities (160 total, 6 thin omitted)

### Community 0 - "student-accounts-view.tsx"
Cohesion: 0.05
Nodes (69): metadata, metadata, metadata, metadata, metadata, metadata, DataTable(), FilterSelect() (+61 more)

### Community 1 - "student-accounts/schemas.ts"
Cohesion: 0.05
Nodes (35): Staff endpoints, Student endpoints (student session; never staff), Student portal & student accounts API, ACTIVATION_CODE_ALPHABET, ACTIVATION_CODE_LENGTH, activationCodeInput, IssueActivationCodes, issueActivationCodesSchema (+27 more)

### Community 2 - "RequirePermissions"
Cohesion: 0.16
Nodes (23): ApiConsumes, ApiProduces, RequirePermissions(), download(), ImportsController, RowNumberPipe, StepDocs(), ApiBody (+15 more)

### Community 3 - "config/package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, eslint, eslint, globals, typescript, name, peerDependencies (+7 more)

### Community 4 - "button.tsx"
Cohesion: 0.10
Nodes (44): Field(), SelectField(), applyServerErrors(), useSaveAcademicSession(), EMPTY, SessionDialog(), useActiveDepartmentOptions(), useSaveDepartment() (+36 more)

### Community 5 - "ref_react"
Cohesion: 0.06
Nodes (44): AdminBreadcrumbs(), NavLinks(), sidebarPreference, BreadcrumbLabelProvider(), LabelContext, Setter, useBreadcrumbLabel(), ADMIN_NAV (+36 more)

### Community 6 - "common.ts"
Cohesion: 0.06
Nodes (44): ActivityItem, activityItemSchema, atLeastOneField(), blankToUndefined(), codeSchema, dateOnlySchema, listQuerySchema(), masterDataStatusSchema (+36 more)

### Community 7 - "ui/package.json"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "health.service.ts"
Cohesion: 0.11
Nodes (15): TimeoutError, withTimeout(), HealthController, ApiTags, Controller, HealthModule, Module, DependencyName (+7 more)

### Community 9 - "api/test/helpers.ts"
Cohesion: 0.11
Nodes (36): PasswordResetNotifier, auditFor(), Detail, newStudent(), attempt(), config, postPreAuth(), as() (+28 more)

### Community 10 - "student-accounts.controller.ts"
Cohesion: 0.08
Nodes (24): openApiRequestSchema(), UuidParamPipe, error, portalState(), RegistrationRow, rowInclude, StudentAccountsService, Injectable (+16 more)

### Community 11 - "database/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @prisma/adapter-pg, @prisma/client, description, exports, ./testing, files, @docversity/config (+11 more)

### Community 12 - "academic.controllers.ts"
Cohesion: 0.06
Nodes (31): error, MUTATION_ERRORS, packages_validation_dist_index_academicsession, packages_validation_dist_index_academicsessionlist, packages_validation_dist_index_academicsessionqueryschema, packages_validation_dist_index_activitylist, packages_validation_dist_index_createacademicsessionschema, packages_validation_dist_index_createdepartmentschema (+23 more)

### Community 13 - "packages_validation_dist_index"
Cohesion: 0.05
Nodes (58): AcademicSessionsService, CODE_CONFLICT, include, SessionRow, toSession(), Injectable, CODE_CONFLICT, DepartmentRow (+50 more)

### Community 14 - ".writeAuditEvent"
Cohesion: 0.15
Nodes (7): Inject, AuthService, toAuthUser(), Injectable, summariseUserAgent(), StudentAuthService, Injectable

### Community 15 - "worker/package.json"
Cohesion: 0.05
Nodes (42): dependencies, bullmq, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation, ioredis (+34 more)

### Community 16 - "students.ts"
Cohesion: 0.06
Nodes (35): ActivityList, activityListSchema, CreateRegistration, CreateRegistrationInput, createRegistrationSchema, CreateStudent, CreateStudentInput, NewRegistration (+27 more)

### Community 17 - "src/env.ts"
Cohesion: 0.20
Nodes (12): loadRootEnv(), loadWorkerEnv(), WorkerEnv, workerEnvSchema, log(), main(), packages_storage_dist_index_s3objectstorage, packages_validation_dist_index_databaseenvschema (+4 more)

### Community 18 - "support/db.ts"
Cohesion: 0.15
Nodes (15): packages_database_src_index_prismaclient, db, f, db, f, db, f, db (+7 more)

### Community 19 - ".login"
Cohesion: 0.20
Nodes (21): ApiAcceptedResponse, AuthController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity (+13 more)

### Community 20 - "auth.controller.ts"
Cohesion: 0.07
Nodes (48): errorResponse, AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY, CsrfMode, PERMISSIONS_KEY (+40 more)

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
Cohesion: 0.09
Nodes (22): API_ROUTE_PREFIX, configureApp(), LOG_LEVELS, OPENAPI_JSON_PATH, CSRF_HEADER, accessLogMiddleware(), logger, ErrorDetail (+14 more)

### Community 26 - "activity.ts"
Cohesion: 0.22
Nodes (10): AuditRow, count(), FIELD_LABELS, fields(), plural(), status(), summarizeAudit(), viaImport() (+2 more)

### Community 27 - "web/package.json"
Cohesion: 0.06
Nodes (29): description, @docversity/config, @docversity/database, @docversity/imports, @docversity/types, @docversity/validation, eslint, globals (+21 more)

### Community 28 - "import-detail-view.tsx"
Cohesion: 0.06
Nodes (55): metadata, metadata, metadata, PageHeader(), ForbiddenState(), importKeys, importsApi, RUNNING_STATUSES (+47 more)

### Community 29 - "tasks"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "next"
Cohesion: 0.05
Nodes (43): AdminLoginPage(), metadata, ProtectedAdminLayout(), metadata, metadata, metadata, metadata, metadata (+35 more)

### Community 31 - "Authentication"
Cohesion: 0.10
Nodes (33): Redis 7.4 service, Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Login rate limiting (fixed-window Redis counters), Password reset (single-use token in URL fragment), Redis unavailable → fail closed (503) (+25 more)

### Community 32 - "Database Documentation"
Cohesion: 0.10
Nodes (28): Academic audit events (safe metadata), No-deletes rule (deactivate via status), Transactional student + registration creation, Standard error envelope (code, message, requestId), Correlation IDs and redacted JSON logs, ADR-0006 Database-enforced integrity, Public result lookup (registration number + unconfirmed second identifier), Unresolved Client Decisions (Schema Impact) (+20 more)

### Community 33 - "types/package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "api/package.json"
Cohesion: 0.06
Nodes (31): description, bullmq, @docversity/config, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+23 more)

### Community 35 - "programs/api.ts"
Cohesion: 0.22
Nodes (8): programKeys, programsApi, packages_validation_dist_index_createprogram, packages_validation_dist_index_programlistschema, packages_validation_dist_index_programquery, packages_validation_dist_index_programschema, packages_validation_dist_index_updateprogram, @tanstack/react-query

### Community 36 - "lib/api.ts"
Cohesion: 0.11
Nodes (23): metadata, DashboardView(), ReportButton(), toggleStatus(), studentPortalApi, StudentActivationForm(), onSubmit(), StudentLoginForm() (+15 more)

### Community 37 - "@nestjs/common"
Cohesion: 0.06
Nodes (43): ClientInfo, Inject, IdentifierHasher, randomToken(), safeEqual(), Inject, Injectable, PASSWORD_RESET_NOTIFIER (+35 more)

### Community 38 - "env.test.ts"
Cohesion: 0.09
Nodes (22): ImportLimitsEnv, importLimitsEnvSchema, QueueEnv, queueEnvSchema, EnvValidationError, parseEnv(), envBoolean, httpUrl (+14 more)

### Community 39 - ".activate"
Cohesion: 0.16
Nodes (21): preAuthCsrfCookieOptions(), StudentAuthController, StudentController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse (+13 more)

### Community 40 - "SessionStore"
Cohesion: 0.30
Nodes (4): sha256(), parseRecord(), SessionStore, Injectable

### Community 41 - "Frontend"
Cohesion: 0.15
Nodes (17): Paginated list contract (page, pageSize, sortBy allow-list), Authentication endpoints (/api/v1/auth/*), Frontend, AdminShell (protected admin layout), Frontend Animation Rules, Framer Motion (default UI motion), GSAP (timeline-heavy special effects only), No animation in admin data views / verification results (+9 more)

### Community 42 - "documents/package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "value-maps.tsx"
Cohesion: 0.13
Nodes (20): getError(), selectValue(), AUTOMATIC_LABEL, Options, STATUS_OPTIONS, Label(), Select(), SelectContent() (+12 more)

### Community 44 - "create-admin-core.ts"
Cohesion: 0.20
Nodes (13): createAdmin(), CreateAdminError, CreateAdminInput, main(), prompt(), promptHidden(), rootEnv, ensureRoles() (+5 more)

### Community 45 - "validation/src/index.ts"
Cohesion: 0.10
Nodes (15): ERROR_CODES, ErrorCode, ErrorResponse, errorResponseSchema, HealthResponse, healthResponseSchema, HealthServiceName, ServiceStatus (+7 more)

### Community 46 - "api/src/main.ts"
Cohesion: 0.15
Nodes (14): AppModule, Module, installNotFoundFallback(), logLevelsFor(), SWAGGER_PATH, loadApiConfig(), loadRootEnv(), bootstrap() (+6 more)

### Community 47 - "UsersService"
Cohesion: 0.19
Nodes (5): assertPasswordPolicy(), PasswordResetStore, Injectable, Injectable, UsersService

### Community 48 - ".issue"
Cohesion: 0.18
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
Cohesion: 0.20
Nodes (7): CsrfGuard, normalizeOrigin(), Inject, Injectable, CsrfService, Inject, Injectable

### Community 54 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @axe-core/playwright, @docversity/config, @docversity/database, @docversity/imports, eslint, globals, jsdom (+11 more)

### Community 55 - "engine.ts"
Cohesion: 0.08
Nodes (56): appendAudit(), chunks(), computeRowCounts(), dateOnly(), Db, ExistingRow, existingSelect, fromDateOnly() (+48 more)

### Community 56 - "students/api.ts"
Cohesion: 0.17
Nodes (11): studentKeys, studentsApi, packages_validation_dist_index_activitylistschema, packages_validation_dist_index_createregistration, packages_validation_dist_index_createstudent, packages_validation_dist_index_registrationschema, packages_validation_dist_index_studentdetailschema, packages_validation_dist_index_studentlistschema (+3 more)

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
Cohesion: 0.29
Nodes (13): Staff, activate(), activatedStudent(), Agent, cookieNamesOf(), expectStatus(), issueCode(), newRegistration() (+5 more)

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
Cohesion: 0.12
Nodes (38): testDb(), config, registrationsWith(), validatedImport(), config, mixedWorkbook(), validated(), config (+30 more)

### Community 67 - "Documentation Index"
Cohesion: 0.14
Nodes (14): Academic Masters API (Phase 4), Server-side relation resolution rules, API Documentation, /api/v1 business endpoint prefix, Swagger / OpenAPI (generated), Zod schemas as single source of truth for OpenAPI, React Hook Form with shared Zod schemas, Knowledge graph (graphify) (+6 more)

### Community 68 - "AuthContext"
Cohesion: 0.44
Nodes (9): MutationDocs(), ApiBody, ApiCreatedResponse, ApiOperation, Body, Post, AuthContext, CurrentAuth (+1 more)

### Community 69 - "Excel Bulk Import Validation Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "DOCVERSITY README"
Cohesion: 0.12
Nodes (25): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+17 more)

### Community 71 - "lib/env.ts"
Cohesion: 0.14
Nodes (14): { IMPORT_MAX_FILE_MB }, nextConfig, rootEnvFile, securityHeaders, loadWebEnv(), WebEnv, webEnvSchema, config (+6 more)

### Community 72 - "imports.test.tsx"
Cohesion: 0.21
Nodes (16): SessionProvider(), department, COUNTS, IMPORTER, EMPTY_PAGE, mockFetch(), REGISTRAR, renderWithProviders() (+8 more)

### Community 73 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+6 more)

### Community 74 - "status/page.tsx"
Cohesion: 0.24
Nodes (7): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), healthy

### Community 75 - "academic.test.ts"
Cohesion: 0.17
Nodes (11): departmentQuerySchema, updateDepartmentSchema, createProgramSchema, createStudentSchema, packages_validation_src_index_createacademicsessionschema, packages_validation_src_index_createprogramschema, packages_validation_src_index_createstudentschema, packages_validation_src_index_departmentqueryschema (+3 more)

### Community 76 - "Academic Trust Matrix design system"
Cohesion: 0.13
Nodes (25): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration, cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui) (+17 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "cn"
Cohesion: 0.05
Nodes (61): metadata, useSetBreadcrumbLabel(), initials(), UserMenu(), RowAction, RowActions(), STATUS_LABELS, TONE (+53 more)

### Community 79 - "ApiOkResponse"
Cohesion: 0.16
Nodes (16): AcademicSessionsController, DashboardController, DepartmentsController, ProgramsController, RegistrationsController, StudentsController, ApiCookieAuth, ApiOkResponse (+8 more)

### Community 80 - "imports/package.json"
Cohesion: 0.05
Nodes (38): dependencies, @docversity/database, @docversity/storage, @docversity/types, @docversity/validation, exceljs, description, devDependencies (+30 more)

### Community 81 - "fixtures"
Cohesion: 0.23
Nodes (16): db, f, db, f, uid(), fixtures(), examContext(), examination() (+8 more)

### Community 82 - "imports/src/index.ts"
Cohesion: 0.13
Nodes (24): RFC-9562, ImportEngine, ImportStepResult, storeReport(), actionRequired(), buildErrorReport(), ReportRow, ReportSummary (+16 more)

### Community 83 - "academic-sessions.ts"
Cohesion: 0.13
Nodes (16): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSession, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema (+8 more)

### Community 84 - "QR Document Scanner & Verifier Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "testing.ts"
Cohesion: 0.11
Nodes (14): What an import of this file needs (once authorised), buildWorkbook(), FixtureCell, FixtureSheet, FixtureStudent, Registration2025Row, registration2025Sheet(), REGISTRATION_2025_HEADERS (+6 more)

### Community 86 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Initial Stitch Migration Plan (archived)"
Cohesion: 0.09
Nodes (33): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Public shell app/(public), Initial Stitch Migration Plan (archived), Certificate architecture (draft → approve → issue → revoke/supersede), Excel import architecture (upload → map → validate → commit), Fake verification outcomes in Stitch export (+25 more)

### Community 88 - "Architecture Overview"
Cohesion: 0.11
Nodes (18): Student photo upload deferred, Architecture Overview, ADR-0002 Separate API, ADR-0003 Background worker, ADR-0004 Object storage, ADR-0005 Toolchain baseline, API enqueues heavy jobs to worker via Redis, Browser talks to Next.js only (+10 more)

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
Cohesion: 0.19
Nodes (11): ContainerEntry, ContainerLimits, inspectXlsxContainer(), OLE_SIGNATURE, verifyXlsxContainer(), openWorkbook(), readSource(), ImportFileError (+3 more)

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "student-rows.ts"
Cohesion: 0.08
Nodes (34): calendarDate(), DateParse, FORMAT_HINT, pad(), parseDateCell(), parseDateText(), error(), FieldValues (+26 more)

### Community 102 - "ImportsService"
Cohesion: 0.16
Nodes (9): ImportsService, iso(), issues(), notNow(), parseFailure(), parseMapping(), parseSheets(), stateConflict() (+1 more)

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
Cohesion: 0.05
Nodes (46): AppError, error, STEP_ERRORS, ImportsModule, Module, ACCEPTED_MIME_TYPES, DownloadFile, jobInclude (+38 more)

### Community 112 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "test/registration-2025.test.ts"
Cohesion: 0.12
Nodes (22): StudentValidationContext, ARCHIVED, DEPT, existingRegistration(), INACTIVE_DEPT, INACTIVE_PROGRAM, LOOSE, MBA (+14 more)

### Community 114 - "development-fixtures.ts"
Cohesion: 0.15
Nodes (14): checkDatabaseConnection(), CreatePrismaClientOptions, packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prismaclient, DEV_FIXTURE_LABEL, PROGRAMS, seedDevelopmentFixtures(), SeedSummary (+6 more)

### Community 115 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 116 - "@docversity/config shared tooling configuration"
Cohesion: 0.67
Nodes (3): @docversity/config shared tooling configuration, Shared ESLint configs (base/node/nextjs) + Prettier formatting, Shared TypeScript configs (base/node/nestjs/nextjs)

### Community 122 - "workbook.ts"
Cohesion: 0.16
Nodes (23): BLANK, cellDisplay(), dateToIso(), isRecord(), plainResult(), richText(), SourceCell, toSourceCell() (+15 more)

### Community 123 - "app.module.ts"
Cohesion: 0.06
Nodes (31): AcademicModule, Module, AuditModule, Global, Module, AuthModule, Global, Module (+23 more)

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
Cohesion: 0.14
Nodes (14): Audit, Commit and idempotency, Create / update / skip policy, Flow, Imports (Phase 5: students / registrations), Known limitations, Limits and production tuning, Retries and failures (+6 more)

### Community 129 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, db:check, db:deploy, db:generate, db:migrate, db:seed (+7 more)

### Community 130 - "mapping.ts"
Cohesion: 0.27
Nodes (8): MappingProblem, validateStudentMapping(), columns(), sheet(), packages_validation_dist_index_importcolumn, packages_validation_dist_index_importmapping, packages_validation_dist_index_importmappingschema, packages_validation_dist_index_normalizeimportheader

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
Cohesion: 0.23
Nodes (10): createPrismaClient(), LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions, loadRootEnv(), ProvidedContext, setup() (+2 more)

### Community 145 - "base.js"
Cohesion: 0.40
Nodes (4): baseConfig(), eslint-config-prettier, @eslint/js, typescript-eslint

### Community 146 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @docversity/config, eslint, @types/node, typescript, vitest

### Community 147 - "prepare-e2e.mjs"
Cohesion: 0.15
Nodes (12): apps_api_dist_auth_password_service, apps_api_dist_auth_password_service_passwordservice, apps_api_dist_cli_create_admin_core, apps_api_dist_cli_create_admin_core_createadmin, apps_api_dist_cli_roles, apps_api_dist_cli_roles_ensureroles, credentials, db (+4 more)

### Community 148 - "create-workers.ts"
Cohesion: 0.29
Nodes (8): bullmqConnection(), createWorkers(), CreateWorkersOptions, importProcessor(), engine, packages_storage_dist_index_memoryobjectstorage, packages_types_dist_index_queue_names, ref_bullmq

### Community 149 - "database/src/index.ts"
Cohesion: 0.29
Nodes (9): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client_prisma, packages_database_src_generated_prisma_models (+1 more)

### Community 150 - "ref_vitest"
Cohesion: 0.20
Nodes (3): validEnv, packages_validation_dist_index_envvalidationerror, ref_vitest

### Community 151 - "ref_node_url"
Cohesion: 0.22
Nodes (7): e2eDatabaseUrl, isCI, rootEnv, rootEnvFile, ref_node_fs, ref_node_url, prisma

### Community 152 - "ADR-0005: Toolchain baseline and version pins"
Cohesion: 0.27
Nodes (10): ADR-0001: pnpm workspaces + Turborepo monorepo, minimumReleaseAge supply-chain gate, pnpm workspaces, Turborepo task graph, ADR-0005: Toolchain baseline and version pins, allowBuilds install-script allow-list, Native ESM everywhere, Version pins (TS 6.0.3, Next 16.3.8, Prisma 7.10.0, ESLint 9.39.5, NestJS 12, Zod 4.6.5) (+2 more)

### Community 153 - "academic-sessions/api.ts"
Cohesion: 0.25
Nodes (7): sessionKeys, sessionsApi, packages_validation_dist_index_academicsessionlistschema, packages_validation_dist_index_academicsessionquery, packages_validation_dist_index_academicsessionschema, packages_validation_dist_index_createacademicsession, packages_validation_dist_index_updateacademicsession

### Community 154 - "departments/api.ts"
Cohesion: 0.25
Nodes (7): departmentKeys, departmentsApi, packages_validation_dist_index_createdepartment, packages_validation_dist_index_departmentlistschema, packages_validation_dist_index_departmentquery, packages_validation_dist_index_departmentschema, packages_validation_dist_index_updatedepartment

### Community 155 - "processors.ts"
Cohesion: 0.36
Nodes (5): processHealthTestJob(), processSystemJob(), packages_types_dist_index_system_job_names, packages_validation_dist_index_healthtestjobdataschema, packages_validation_dist_index_healthtestjobresult

### Community 156 - "enqueue-health-test.ts"
Cohesion: 0.25
Nodes (7): connection, deadline, env, events, queue, packages_validation_dist_index_health_test_default_message, packages_validation_dist_index_healthtestjobresultschema

### Community 157 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @docversity/config, eslint, prisma, @types/node, typescript, vitest

### Community 158 - ".getHealth"
Cohesion: 0.33
Nodes (5): ApiServiceUnavailableResponse, ApiOkResponse, ApiOperation, Get, Res

### Community 159 - "ADR-0010: Students are a separate principal, activated with university-issued codes"
Cohesion: 0.50
Nodes (3): ADR-0010: Students are a separate principal, activated with university-issued codes, Consequences, Context

## Ambiguous Edges - Review These
- `Six-Step Import Wizard Stepper` → `Registry Pipeline v2.4`  [AMBIGUOUS]
  references/stitch/stitch_docversity_ui_ux_design_system/excel_bulk_import_validation/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **1193 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+1188 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1548 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Imports API (`/api/v1/imports`)` connect `activity.ts` to `Documentation Index`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Documentation Index` connect `Documentation Index` to `Database Documentation`, `DOCVERSITY README`, `Frontend`, `Student portal, profile changes and historic certificates — architecture (proposed)`, `Initial Stitch Migration Plan (archived)`, `Architecture Overview`, `Authentication`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _1193 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `student-accounts-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05049442457395329 - nodes in this community are weakly interconnected._
- **Should `student-accounts/schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `config/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._