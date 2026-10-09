# Graph Report - docversity  (2026-10-09)

## Corpus Check
- 599 files · ~836,181 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 5110 nodes · 13275 edges · 198 communities (184 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 424 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aac2c19e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- examinations-view.tsx
- student-accounts/schemas.ts
- ImportsController
- config/package.json
- packages_validation_dist_index
- cn
- common.ts
- ui/package.json
- departments/api.ts
- api/test/helpers.ts
- student-accounts.controller.ts
- database/package.json
- curriculum-editor-view.tsx
- app.module.ts
- auth.controller.ts
- worker/package.json
- students.ts
- academic.controllers.ts
- support/db.ts
- .login
- re-exams.ts
- scripts
- auth.schema.ts
- permissions.test.ts
- validation/package.json
- app.setup.ts
- Staff endpoints (staff session; unsafe methods need the staff CSRF token)
- web/package.json
- PrismaService
- tasks
- coming-soon.tsx
- Authentication
- Database Documentation
- types/package.json
- api/package.json
- import-detail-view.tsx
- next
- pageArgs
- ref_zod
- student-auth.controller.ts
- ui/src/index.ts
- Frontend
- documents/package.json
- student/login/page.tsx
- getStudentSessionState
- lib/api.ts
- notifications/page.tsx
- historical-documents/schemas.ts
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
- re-exams.controller.ts
- imports/support.ts
- curricula.controllers.ts
- programs.service.ts
- Excel Bulk Import Validation Screen
- DOCVERSITY README
- loadWebEnv
- ref_vitest
- devDependencies
- status/page.tsx
- historical-documents.service.ts
- Academic Trust Matrix design system
- compilerOptions
- admin/login/page.tsx
- RequirePermissions
- imports/package.json
- uid
- imports/src/index.ts
- testDb
- QR Document Scanner & Verifier Screen
- curricula.ts
- compilerOptions
- Phase 7B — Course management and curriculum versions
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
- api-config.ts
- storage/src/index.ts
- TestOnlyController
- storage/package.json
- student-fields.ts
- rethrowAsFieldConflict
- CLAUDE.md
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
- prepare-test-database.ts
- base.js
- devDependencies
- Phase 6.5 — Student portal UI
- enqueue-health-test.ts
- database/src/index.ts
- document-detail-view.tsx
- create-admin-core.ts
- student-profile/schemas.ts
- src/env.ts
- AuthContext
- profile-requests.service.ts
- examinations/schemas.ts
- .writeAuditEvent
- Initial Stitch Migration Plan (archived)
- .replace
- Imports (Phase 5: students / registrations)
- StudentContext
- @nestjs/common
- ExaminationsService
- students/api.ts
- ProfileRequestsService
- CurrentAuth
- HistoricalDocumentsService
- API Documentation
- server-auth.ts
- ReExamsService
- ref_node_url
- testing.ts
- scripts
- student-copy.ts
- student-copy.test.ts
- GLOSSARY.md
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_js
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_passwordservice
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_createadmin
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_js
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_ensureroles
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_js
- historical-documents/historical-documents.test.ts
- examinations.md
- historical-documents.spec.ts
- student-copy-backfill.ts
- activity.ts
- Phase 8 — Historical certificates and the student document library (delivery report)
- examination-detail-view.tsx
- document-file.ts
- FeeRulesService
- JsonLogger
- schema/historical-documents.test.ts
- SubjectsService
- .studentDelivery
- Phase 9 — External examinations, re-exam applications and regional QR payments (delivery report)
- (portal)/examinations/page.tsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 116 edges
2. `@nestjs/common` - 111 edges
3. `RequirePermissions()` - 101 edges
4. `next` - 98 edges
5. `AuthContext` - 78 edges
6. `CurrentAuth` - 68 edges
7. `errorMessage()` - 68 edges
8. `AppError` - 60 edges
9. `Button()` - 56 edges
10. `useCan()` - 55 edges

## Surprising Connections (you probably didn't know these)
- `Imports API (`/api/v1/imports`)` --references--> `status()`  [INFERRED]
  docs/api/imports.md → apps/api/src/academic/activity.ts
- `Staff endpoints (staff session + staff CSRF token)` --references--> `status()`  [INFERRED]
  docs/api/profile-requests.md → apps/api/src/academic/activity.ts
- `Consequences` --references--> `StudentRoute()`  [INFERRED]
  docs/decisions/ADR-0010-student-authentication.md → apps/api/src/student-auth/student-auth.decorators.ts
- `Retries and failures` --references--> `ImportFileError`  [INFERRED]
  docs/architecture/imports.md → packages/imports/src/errors.ts
- `Requirement coverage` --references--> `ObjectStorage`  [INFERRED]
  docs/development/phase-8-historical-certificates.md → packages/storage/src/object-storage.ts

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

## Communities (198 total, 14 thin omitted)

### Community 0 - "examinations-view.tsx"
Cohesion: 0.05
Nodes (88): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+80 more)

### Community 1 - "student-accounts/schemas.ts"
Cohesion: 0.06
Nodes (31): ACTIVATION_CODE_ALPHABET, ACTIVATION_CODE_LENGTH, activationCodeInput, IssueActivationCodes, issueActivationCodesSchema, IssuedActivationCodes, issuedActivationCodesSchema, passwordInput (+23 more)

### Community 2 - "ImportsController"
Cohesion: 0.15
Nodes (22): download(), ImportsController, RowNumberPipe, StepDocs(), ApiBody, ApiConsumes, ApiCookieAuth, ApiCreatedResponse (+14 more)

### Community 3 - "config/package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, eslint, eslint, globals, typescript, name, peerDependencies (+7 more)

### Community 4 - "packages_validation_dist_index"
Cohesion: 0.05
Nodes (97): metadata, metadata, Field(), getError(), SelectField(), selectValue(), applyServerErrors(), useSaveAcademicSession() (+89 more)

### Community 5 - "cn"
Cohesion: 0.03
Nodes (91): metadata, AdminBreadcrumbs(), AdminShell(), NavLinks(), sidebarPreference, useBreadcrumbLabel(), ADMIN_NAV, AdminNavItem (+83 more)

### Community 6 - "common.ts"
Cohesion: 0.04
Nodes (67): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSession, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema (+59 more)

### Community 7 - "ui/package.json"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "departments/api.ts"
Cohesion: 0.25
Nodes (7): departmentKeys, departmentsApi, packages_validation_dist_index_createdepartment, packages_validation_dist_index_departmentlistschema, packages_validation_dist_index_departmentquery, packages_validation_dist_index_departmentschema, packages_validation_dist_index_updatedepartment

### Community 9 - "api/test/helpers.ts"
Cohesion: 0.12
Nodes (33): PasswordResetNotifier, REDACTED, attempt(), config, postPreAuth(), as(), attemptsFromForwardedIps(), healthWith() (+25 more)

### Community 10 - "student-accounts.controller.ts"
Cohesion: 0.09
Nodes (23): UuidParamPipe, error, portalState(), RegistrationRow, rowInclude, StudentAccountsService, Injectable, generateActivationCode() (+15 more)

### Community 11 - "database/package.json"
Cohesion: 0.07
Nodes (26): dependencies, @prisma/adapter-pg, @prisma/client, description, devDependencies, @docversity/config, eslint, prisma (+18 more)

### Community 12 - "curriculum-editor-view.tsx"
Cohesion: 0.06
Nodes (41): metadata, metadata, BreadcrumbLabelProvider(), LabelContext, Setter, useSetBreadcrumbLabel(), curriculaApi, useCurricula() (+33 more)

### Community 13 - "app.module.ts"
Cohesion: 0.06
Nodes (31): AppModule, Module, AuditModule, Global, Module, AuthModule, Global, Module (+23 more)

### Community 14 - "auth.controller.ts"
Cohesion: 0.05
Nodes (38): errorResponse, Inject, assertPasswordPolicy(), AuthService, ClientInfo, toAuthUser(), Injectable, summariseUserAgent() (+30 more)

### Community 15 - "worker/package.json"
Cohesion: 0.05
Nodes (42): dependencies, bullmq, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation, ioredis (+34 more)

### Community 16 - "students.ts"
Cohesion: 0.04
Nodes (49): Create / update / skip policy, Validation, curriculumRefSchema, departmentQuerySchema, updateDepartmentSchema, ActivityList, activityListSchema, CreateRegistration (+41 more)

### Community 17 - "academic.controllers.ts"
Cohesion: 0.07
Nodes (29): error, MUTATION_ERRORS, packages_validation_dist_index_academicsession, packages_validation_dist_index_academicsessionlist, packages_validation_dist_index_academicsessionqueryschema, packages_validation_dist_index_activitylist, packages_validation_dist_index_createacademicsessionschema, packages_validation_dist_index_createdepartmentschema (+21 more)

### Community 18 - "support/db.ts"
Cohesion: 0.12
Nodes (16): db, f, db, f, db, f, db, f (+8 more)

### Community 19 - ".login"
Cohesion: 0.17
Nodes (21): ApiAcceptedResponse, AuthController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity (+13 more)

### Community 20 - "re-exams.ts"
Cohesion: 0.04
Nodes (62): ApproveReExamApplication, approveReExamApplicationSchema, CreateReExamApplication, createReExamApplicationSchema, CreateReExamFeeRule, CreateReExamFeeRuleInput, createReExamFeeRuleSchema, currencyMinorDigits() (+54 more)

### Community 21 - "scripts"
Cohesion: 0.06
Nodes (33): description, devDependencies, prettier, turbo, typescript, engines, node, typescript (+25 more)

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
Cohesion: 0.08
Nodes (30): API_ROUTE_PREFIX, configureApp(), installNotFoundFallback(), LOG_LEVELS, logLevelsFor(), OPENAPI_JSON_PATH, SWAGGER_PATH, accessLogMiddleware() (+22 more)

### Community 26 - "Staff endpoints (staff session; unsafe methods need the staff CSRF token)"
Cohesion: 0.14
Nodes (16): status(), student(), Examination records (staff), Examinations (Phase 9), Phase 9A — external examination application and examination records, Phase 9B — re-exam applications, attempts and fee rules, Rules, Staff (+8 more)

### Community 27 - "web/package.json"
Cohesion: 0.07
Nodes (29): description, @docversity/config, @docversity/database, @docversity/imports, @docversity/types, @docversity/validation, eslint, globals (+21 more)

### Community 28 - "PrismaService"
Cohesion: 0.09
Nodes (14): AuditService, Injectable, Inject, IdentifierHasher, Inject, Injectable, PrismaService, Inject (+6 more)

### Community 29 - "tasks"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "coming-soon.tsx"
Cohesion: 0.10
Nodes (9): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+1 more)

### Community 31 - "Authentication"
Cohesion: 0.09
Nodes (36): Redis 7.4 service, Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Login rate limiting (fixed-window Redis counters), Password reset (single-use token in URL fragment), Redis unavailable → fail closed (503) (+28 more)

### Community 32 - "Database Documentation"
Cohesion: 0.07
Nodes (41): Academic audit events (safe metadata), Transactional student + registration creation, Certificate architecture (draft → approve → issue → revoke/supersede), Excel import architecture (upload → map → validate → commit), TECHNICAL-AUDIT.md (legacy WordPress audit), Product Decisions Already Agreed, Historic QR compatibility (legacy verify.thedocversity.com URLs), Legacy WordPress verification system (+33 more)

### Community 33 - "types/package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "api/package.json"
Cohesion: 0.06
Nodes (30): description, bullmq, @docversity/config, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+22 more)

### Community 35 - "import-detail-view.tsx"
Cohesion: 0.04
Nodes (75): metadata, metadata, metadata, ForbiddenState(), toggleStatus(), importKeys, importsApi, RUNNING_STATUSES (+67 more)

### Community 36 - "next"
Cohesion: 0.05
Nodes (65): metadata, metadata, STATUS_LABELS, APPLICATION_STATUS, STATUS_OPTIONS, CodesDialog(), Detail(), isStudentNavActive() (+57 more)

### Community 37 - "pageArgs"
Cohesion: 0.14
Nodes (7): DepartmentsService, toDepartment(), Injectable, pageArgs(), paginationMeta(), toRow(), issues()

### Community 38 - "ref_zod"
Cohesion: 0.05
Nodes (38): ImportLimitsEnv, importLimitsEnvSchema, QueueEnv, queueEnvSchema, EnvValidationError, parseEnv(), envBoolean, httpUrl (+30 more)

### Community 39 - "student-auth.controller.ts"
Cohesion: 0.05
Nodes (63): AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY, CsrfMode, PERMISSIONS_KEY, AuthGuard (+55 more)

### Community 40 - "ui/src/index.ts"
Cohesion: 0.12
Nodes (15): EXAM_STATUS, KIND_OPTIONS, STATUS_FILTER_OPTIONS, PROFILE_REQUEST_STATUS, PROFILE_REQUEST_STATUS_OPTIONS, PORTAL_STATE, PORTAL_STATE_OPTIONS, DOTS (+7 more)

### Community 41 - "Frontend"
Cohesion: 0.12
Nodes (24): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Paginated list contract (page, pageSize, sortBy allow-list), Authentication endpoints (/api/v1/auth/*), Frontend, AdminShell (protected admin layout), List state in the URL (+16 more)

### Community 42 - "documents/package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "student/login/page.tsx"
Cohesion: 0.21
Nodes (10): metadata, StudentLoginPage(), metadata, StudentRegisterPage(), StudentActivationForm(), onSubmit(), StudentLoginForm(), onSubmit() (+2 more)

### Community 44 - "getStudentSessionState"
Cohesion: 0.15
Nodes (17): metadata, Page(), metadata, Page(), StudentPortalLayout(), StudentHomePage(), metadata, Page() (+9 more)

### Community 45 - "lib/api.ts"
Cohesion: 0.05
Nodes (58): metadata, metadata, UserMenu(), signOut(), QueryProvider(), useSessionUser(), sessionKeys, sessionsApi (+50 more)

### Community 46 - "notifications/page.tsx"
Cohesion: 0.29
Nodes (3): metadata, metadata, StudentUnavailable()

### Community 47 - "historical-documents/schemas.ts"
Cohesion: 0.03
Nodes (58): AUTHENTICITY_LABELS, certificateNumberSchema, DOCUMENT_AUTHENTICITY, DOCUMENT_PROVENANCES, DocumentAuthenticity, documentAuthenticitySchema, DocumentDisposition, documentDispositionSchema (+50 more)

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
Cohesion: 0.18
Nodes (19): addNewSubject(), choose(), createCourse(), shared, SERVICES, issueCode(), openRequest(), staffPage() (+11 more)

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
Cohesion: 0.09
Nodes (49): appendAudit(), chunks(), computeRowCounts(), dateOnly(), Db, ExistingRow, existingSelect, fromDateOnly() (+41 more)

### Community 56 - "prepare-e2e.mjs"
Cohesion: 0.10
Nodes (20): apps_api_dist_auth_password_service, apps_api_dist_auth_password_service_passwordservice, apps_api_dist_cli_create_admin_core, apps_api_dist_cli_create_admin_core_createadmin, apps_api_dist_cli_roles, apps_api_dist_cli_roles_ensureroles, loadRootEnv(), ProvidedContext (+12 more)

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
Cohesion: 0.12
Nodes (30): Staff, config, lines, activate(), activatedStudent(), Agent, cookieNamesOf(), expectStatus() (+22 more)

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

### Community 65 - "re-exams.controller.ts"
Cohesion: 0.07
Nodes (41): FeeAssessment, person, ruleInclude, RuleRecord, error, ReExamsModule, Module, AppRecord (+33 more)

### Community 66 - "imports/support.ts"
Cohesion: 0.12
Nodes (34): registrationIn(), config, registrationsWith(), validatedImport(), config, mixedWorkbook(), validated(), config (+26 more)

### Community 67 - "curricula.controllers.ts"
Cohesion: 0.05
Nodes (58): error, NOT_EDITABLE, ASSIGNMENT_ORDER, AssignmentRow, componentsJson(), componentsOf(), detailInclude, DetailRow (+50 more)

### Community 68 - "programs.service.ts"
Cohesion: 0.16
Nodes (14): assertActiveDepartment(), CODE_CONFLICT, include, legacySemesters(), ProgramRow, ProgramsService, structureOf(), toProgram() (+6 more)

### Community 69 - "Excel Bulk Import Validation Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "DOCVERSITY README"
Cohesion: 0.12
Nodes (25): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+17 more)

### Community 71 - "loadWebEnv"
Cohesion: 0.14
Nodes (14): { IMPORT_MAX_FILE_MB }, nextConfig, rootEnvFile, securityHeaders, loadWebEnv(), WebEnv, webEnvSchema, config (+6 more)

### Community 72 - "ref_vitest"
Cohesion: 0.07
Nodes (43): StudentCourses(), CURRICULUM_ADMIN, program, READER, serveCurriculum(), department, EXAM_ADMIN, program (+35 more)

### Community 73 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+6 more)

### Community 74 - "status/page.tsx"
Cohesion: 0.24
Nodes (7): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), healthy

### Community 75 - "historical-documents.service.ts"
Cohesion: 0.07
Nodes (37): error, certificateNumberFields(), detailInclude, DocumentFile, EXTENSIONS, person, rowInclude, RowRecord (+29 more)

### Community 76 - "Academic Trust Matrix design system"
Cohesion: 0.13
Nodes (25): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration, cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui) (+17 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "admin/login/page.tsx"
Cohesion: 0.47
Nodes (4): AdminLoginPage(), metadata, ProtectedAdminLayout(), getSessionState()

### Community 79 - "RequirePermissions"
Cohesion: 0.14
Nodes (25): AcademicSessionsController, DashboardController, DepartmentsController, ProgramsController, RegistrationsController, StudentsController, ApiBody, ApiCookieAuth (+17 more)

### Community 80 - "imports/package.json"
Cohesion: 0.05
Nodes (38): dependencies, @docversity/database, @docversity/storage, @docversity/types, @docversity/validation, exceljs, description, devDependencies (+30 more)

### Community 81 - "uid"
Cohesion: 0.22
Nodes (17): db, f, draftCurriculum(), db, f, uid(), fixtures(), examContext() (+9 more)

### Community 82 - "imports/src/index.ts"
Cohesion: 0.12
Nodes (26): RFC-9562, requireTransition(), transitionImportJob(), actionRequired(), buildErrorReport(), ReportRow, ReportSummary, text() (+18 more)

### Community 83 - "testDb"
Cohesion: 0.09
Nodes (33): activeCurriculum(), add(), course(), curriculum(), detailOf(), subject(), auditFor(), Detail (+25 more)

### Community 84 - "QR Document Scanner & Verifier Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "curricula.ts"
Cohesion: 0.03
Nodes (71): 10b. Course and curriculum management (Phase 7B), ACADEMIC_STRUCTURES, AcademicStructure, AddCurriculumSubject, AddCurriculumSubjectInput, addCurriculumSubjectSchema, AssessmentComponent, assessmentComponentSchema (+63 more)

### Community 86 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Phase 7B — Course management and curriculum versions"
Cohesion: 0.20
Nodes (10): Acceptance fixes, Complete final specification acceptance matrix, Evidence and verification, Historical integrity and migrations, Implemented, Limitations and university decisions, Manual acceptance checklist, Phase 7B — Course management and curriculum versions (+2 more)

### Community 88 - "Architecture Overview"
Cohesion: 0.09
Nodes (26): Student photo upload deferred, Architecture Overview, ADR-0002 Separate API, ADR-0003 Background worker, ADR-0004 Object storage, ADR-0005 Toolchain baseline, API enqueues heavy jobs to worker via Redis, Browser talks to Next.js only (+18 more)

### Community 89 - "nestjs.json"
Cohesion: 0.20
Nodes (9): compilerOptions, emitDecoratorMetadata, experimentalDecorators, strictPropertyInitialization, verbatimModuleSyntax, display, extends, $schema (+1 more)

### Community 90 - "nest-cli.json"
Cohesion: 0.22
Nodes (8): collection, compilerOptions, builder, deleteOutDir, tsConfigPath, entryFile, $schema, sourceRoot

### Community 91 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, admin:create, build, clean, dev, documents:backfill-student-copies, lint, start (+2 more)

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

### Community 99 - "ImportFileError"
Cohesion: 0.13
Nodes (14): ContainerEntry, ContainerLimits, inspectXlsxContainer(), OLE_SIGNATURE, verifyXlsxContainer(), openWorkbook(), readSource(), ImportFileError (+6 more)

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "student-rows.ts"
Cohesion: 0.12
Nodes (22): error(), existingValues(), FieldValues, indexRecords(), NormalizedStudentRow, PROTECTED_FIELDS, RawRowData, readText() (+14 more)

### Community 102 - "ImportsService"
Cohesion: 0.21
Nodes (7): ImportsService, notNow(), parseFailure(), parseMapping(), parseSheets(), stateConflict(), Injectable

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
Nodes (21): ADR-0002: Separate NestJS API instead of Next.js server logic, NestJS REST API (apps/api), Next.js as UI only (no direct DB/Redis/storage access), ADR-0003: Long-running work runs in a BullMQ worker, BullMQ worker on Redis (apps/worker), health-test job on system queue, Idempotent at-least-once jobs, ADR-0007: Server-side Redis sessions with HTTP-only cookies (+13 more)

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
Nodes (45): error, STEP_ERRORS, ACCEPTED_MIME_TYPES, DownloadFile, iso(), jobInclude, JobRow, STATUS_WORDS (+37 more)

### Community 112 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "test/registration-2025.test.ts"
Cohesion: 0.09
Nodes (27): ExistingRegistration, ReferenceData, StudentValidationContext, ARCHIVED, DEPT, existingRegistration(), INACTIVE_DEPT, INACTIVE_PROGRAM (+19 more)

### Community 114 - "development-fixtures.ts"
Cohesion: 0.16
Nodes (13): CreatePrismaClientOptions, packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prismaclient, DEV_FIXTURE_LABEL, PROGRAMS, seedDevelopmentFixtures(), SeedSummary, STUDENTS (+5 more)

### Community 115 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 116 - "@docversity/config shared tooling configuration"
Cohesion: 0.67
Nodes (3): @docversity/config shared tooling configuration, Shared ESLint configs (base/node/nextjs) + Prettier formatting, Shared TypeScript configs (base/node/nestjs/nextjs)

### Community 122 - "workbook.ts"
Cohesion: 0.16
Nodes (23): BLANK, cellDisplay(), dateToIso(), isRecord(), plainResult(), richText(), SourceCell, toSourceCell() (+15 more)

### Community 123 - "api-config.ts"
Cohesion: 0.05
Nodes (40): ApiServiceUnavailableResponse, randomToken(), Inject, LimitResult, LimitRule, Inject, StoredSession, Inject (+32 more)

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
Cohesion: 0.17
Nodes (10): isSensitiveImportHeader(), normalizeImportHeader(), STUDENT_IMPORT_FIELD_KEYS, STUDENT_IMPORT_FIELDS, STUDENT_IMPORT_REQUIRED_FIELDS, studentImportField, StudentImportFieldDefinition, StudentImportFieldKind (+2 more)

### Community 128 - "rethrowAsFieldConflict"
Cohesion: 0.10
Nodes (15): AcademicSessionsService, toSession(), Injectable, FIELD_PATHS, RelationInput, ResolvedRelations, resolveRegistrationRelations(), RegistrationsService (+7 more)

### Community 129 - "CLAUDE.md"
Cohesion: 0.07
Nodes (23): 10. Authentication boundaries, 10a. Student profile change requests (Phase 7), 10c. Historical documents (Phase 8), 10d. Examinations (Phase 9), 11. Student import workflow (Phase 5), 12. API conventions, 13. Security and privacy rules (non-negotiable), 14. Development workflow and Git (+15 more)

### Community 130 - "mapping.ts"
Cohesion: 0.23
Nodes (10): MappingProblem, validateStudentMapping(), columns(), sheet(), packages_validation_dist_index_columnmapping, packages_validation_dist_index_importcolumn, packages_validation_dist_index_importmapping, packages_validation_dist_index_importmappingschema (+2 more)

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

### Community 139 - "students"
Cohesion: 0.09
Nodes (22): Approval, Staff endpoints (staff session + staff CSRF token), Student endpoints (student session cookie + student CSRF token), Student profile change requests (Phase 7), 1. Principles, 2. Student authentication boundary, 3. Proposed database additions (new migrations only), 4. Historic certificate handling (+14 more)

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
Cohesion: 0.19
Nodes (12): checkDatabaseConnection(), createPrismaClient(), packages_database_src_index_prismaclient, LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions, loadRootEnv() (+4 more)

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
Cohesion: 0.13
Nodes (20): bullmqConnection(), createWorkers(), CreateWorkersOptions, importProcessor(), processHealthTestJob(), processSystemJob(), connection, deadline (+12 more)

### Community 149 - "database/src/index.ts"
Cohesion: 0.29
Nodes (9): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client_prisma, packages_database_src_generated_prisma_models (+1 more)

### Community 150 - "document-detail-view.tsx"
Cohesion: 0.08
Nodes (26): metadata, useHistoricalDocument(), DialogKind, DocumentDetailView(), versionLink(), Versions(), AuthenticityDialog(), PublishDialog() (+18 more)

### Community 151 - "create-admin-core.ts"
Cohesion: 0.20
Nodes (13): createAdmin(), CreateAdminError, CreateAdminInput, main(), prompt(), promptHidden(), rootEnv, ensureRoles() (+5 more)

### Community 152 - "student-profile/schemas.ts"
Cohesion: 0.05
Nodes (38): approveProfileRequestSchema, fieldChangeSchema, GENDER_OPTIONS, isPlausibleDateOfBirth(), MAX_STUDENT_AGE_YEARS, MIN_STUDENT_AGE_YEARS, photoInfoSchema, PROFILE_FIELD_LABELS (+30 more)

### Community 153 - "src/env.ts"
Cohesion: 0.16
Nodes (16): main(), rootEnv, backfillStudentCopies(), loadRootEnv(), loadWorkerEnv(), WorkerEnv, workerEnvSchema, log() (+8 more)

### Community 154 - "AuthContext"
Cohesion: 0.19
Nodes (22): MutationDocs(), CurriculaController, ProgramCurriculaController, StudentCurriculumController, SubjectsController, ApiBody, ApiCookieAuth, ApiCreatedResponse (+14 more)

### Community 155 - "profile-requests.service.ts"
Cohesion: 0.06
Nodes (42): AppError, DocumentUploadInterceptor, Injectable, Inject, Injectable, WorkbookUploadInterceptor, PhotoUploadInterceptor, Injectable (+34 more)

### Community 156 - "examinations/schemas.ts"
Cohesion: 0.05
Nodes (37): CreateExamination, CreateExaminationInput, createExaminationSchema, CreateExternalExamApp, CreateExternalExamAppInput, createExternalExamAppSchema, examAppFields, EXAMINATION_KIND_LABELS (+29 more)

### Community 157 - ".writeAuditEvent"
Cohesion: 0.25
Nodes (4): CurriculaService, notEditable(), Injectable, invalidRelation()

### Community 158 - "Initial Stitch Migration Plan (archived)"
Cohesion: 0.20
Nodes (15): Frontend Animation Rules, Framer Motion (default UI motion), GSAP (timeline-heavy special effects only), No animation in admin data views / verification results, Respect prefers-reduced-motion, Initial Stitch Migration Plan (archived), grading module (pure calculation engine), Planned NestJS backend module architecture (+7 more)

### Community 159 - ".replace"
Cohesion: 0.14
Nodes (26): DocumentUploadRequest, HistoricalDocumentsController, multipartDoc(), send(), StudentDocumentsController, ApiBody, ApiConsumes, ApiCookieAuth (+18 more)

### Community 160 - "Imports (Phase 5: students / registrations)"
Cohesion: 0.18
Nodes (11): Audit, Commit and idempotency, Flow, Imports (Phase 5: students / registrations), Known limitations, Limits and production tuning, Retries and failures, Security (+3 more)

### Community 161 - "StudentContext"
Cohesion: 0.19
Nodes (21): FeeRulesController, ReExamApplicationsController, StudentReExamsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation (+13 more)

### Community 162 - "@nestjs/common"
Cohesion: 0.07
Nodes (50): CODE_CONFLICT, include, SessionRow, CODE_CONFLICT, DepartmentRow, include, REGISTRATION_NUMBER_CONFLICT, registrationInclude (+42 more)

### Community 163 - "ExaminationsService"
Cohesion: 0.25
Nodes (5): changedFields(), ExaminationsService, notEditable(), toApp(), Injectable

### Community 164 - "students/api.ts"
Cohesion: 0.16
Nodes (14): studentKeys, studentsApi, useCreateStudent(), useInvalidateStudents(), useSaveRegistration(), useUpdateStudent(), packages_validation_dist_index_activitylistschema, packages_validation_dist_index_createregistration (+6 more)

### Community 165 - "ProfileRequestsService"
Cohesion: 0.08
Nodes (34): PhotoUploadRequest, UploadedPhoto, parseSubmission(), ProfileRequestsController, StudentProfileController, ApiBody, ApiConsumes, ApiCookieAuth (+26 more)

### Community 166 - "CurrentAuth"
Cohesion: 0.15
Nodes (22): CurrentAuth, ExaminationAppsController, ExaminationsController, StudentExaminationsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse (+14 more)

### Community 167 - "HistoricalDocumentsService"
Cohesion: 0.22
Nodes (7): UploadedDocument, cleanFilename(), HistoricalDocumentsService, isImage(), notEditable(), sha256Of(), Injectable

### Community 168 - "API Documentation"
Cohesion: 0.15
Nodes (16): Academic Masters API (Phase 4), No-deletes rule (deactivate via status), Server-side relation resolution rules, Imports API (`/api/v1/imports`), API Documentation, /api/v1 business endpoint prefix, Standard error envelope (code, message, requestId), Swagger / OpenAPI (generated) (+8 more)

### Community 169 - "server-auth.ts"
Cohesion: 0.14
Nodes (16): metadata, Page(), metadata, Page(), StudentReExamApplications(), getStudentReExamApplications, getStudentReExamOptions, SESSION_COOKIES (+8 more)

### Community 170 - "ReExamsService"
Cohesion: 0.14
Nodes (7): conflict(), csvCell(), feeData(), feeOf(), ReExamsService, toRow(), Injectable

### Community 171 - "ref_node_url"
Cohesion: 0.10
Nodes (17): e2eDatabaseUrl, isCI, rootEnv, rootEnvFile, admin, { Client }, db, pgRequire (+9 more)

### Community 172 - "testing.ts"
Cohesion: 0.10
Nodes (19): "Registration 2025.xlsx" — column mapping report, What an import of this file needs (once authorised), calendarDate(), DateParse, FORMAT_HINT, pad(), parseDateCell(), parseDateText() (+11 more)

### Community 173 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, db:check, db:deploy, db:generate, db:migrate, db:seed (+7 more)

### Community 174 - "student-copy.ts"
Cohesion: 0.14
Nodes (20): assertCleanJpeg(), assertCleanPng(), assertNoEmbeddedMetadata(), createStudentCopy(), decodeOptions, embeddedMetadataCategories(), EXIF_DEVICE_TAGS, EXIF_PERSON_TAGS (+12 more)

### Community 175 - "student-copy.test.ts"
Cohesion: 0.21
Nodes (12): certificatePage(), comSegment(), containsEmbeddedValue(), EMBEDDED, iptcSegment(), jpegWithEmbeddedMetadata(), pdfWithCompressedScript(), pngChunk() (+4 more)

### Community 183 - "historical-documents/historical-documents.test.ts"
Cohesion: 0.15
Nodes (19): Agent, detailOf(), draftFor(), fileOf(), FilePart, imageDraft(), legacyImageRow(), metadata() (+11 more)

### Community 184 - "examinations.md"
Cohesion: 0.20
Nodes (8): Blockers found in the existing schema and policy, Manual marks entry — design foundation (Phase 9, Part F), Proposed data contract for manual entry (Phase 10), What already exists (Phase 2 schema, unchanged), ADR-0014: Examinations stay external; Docversity keeps records, re-exam applications and manual payment evidence, Consequences, Context, Decision

### Community 185 - "historical-documents.spec.ts"
Cohesion: 0.14
Nodes (14): shared, staffPage(), studentPage(), choose(), EXIF_VALUES, exifSegment(), scanWithExif(), shared (+6 more)

### Community 186 - "student-copy-backfill.ts"
Cohesion: 0.18
Nodes (11): BackfillItem, backfillOne(), BackfillOutcome, BackfillReport, FAILURES, sha256Of(), ImageContentType, packages_storage_dist_index_objectkeys (+3 more)

### Community 187 - "activity.ts"
Cohesion: 0.22
Nodes (10): AuditRow, count(), FIELD_LABELS, fields(), plural(), summarizeAudit(), viaImport(), packages_types_dist_index_academic_audit_actions (+2 more)

### Community 188 - "Phase 8 — Historical certificates and the student document library (delivery report)"
Cohesion: 0.10
Nodes (18): Audit, File responses, Historical documents and the student document library (Phase 8), Lifecycle, Student endpoints (student session), ADR-0013: Historical documents are staff-managed evidence, separate from issued credentials, Amendment 1 (2026-10-09, pre-merge hardening), Consequences (+10 more)

### Community 189 - "examination-detail-view.tsx"
Cohesion: 0.11
Nodes (17): metadata, metadata, examinationKeys, examinationsApi, useExamApps(), useExamination(), useExaminationMutation(), ExamAppView() (+9 more)

### Community 190 - "document-file.ts"
Cohesion: 0.39
Nodes (7): assertStaticPdf(), DocumentContentType, FORBIDDEN_PDF_NAMES, inspectDocument(), InspectedDocument, invalid(), pdfNames()

### Community 191 - "FeeRulesService"
Cohesion: 0.31
Nodes (4): conflict(), FeeRulesService, toRule(), Injectable

### Community 193 - "schema/historical-documents.test.ts"
Cohesion: 0.39
Nodes (6): db, draft(), f, imageDraft(), sha(), staffUser()

### Community 194 - "SubjectsService"
Cohesion: 0.36
Nodes (3): SubjectsService, toSubject(), Injectable

### Community 195 - ".studentDelivery"
Cohesion: 0.36
Nodes (3): sniffContentType(), notReady(), unavailable()

### Community 196 - "Phase 9 — External examinations, re-exam applications and regional QR payments (delivery report)"
Cohesion: 0.25
Nodes (8): Phase 9 — External examinations, re-exam applications and regional QR payments (delivery report), Phase 9A — external examination application and examination records, Phase 9B continuation validation (2026-10-09), Phase 9B — re-exam applications, attempts and fee rules, Phase 9B screenshots (synthetic fixtures), Screenshots (synthetic E2E data), University-policy blockers (not invented), ExaminationKind

### Community 197 - "(portal)/examinations/page.tsx"
Cohesion: 0.50
Nodes (4): metadata, Page(), StudentExaminationsPage(), getStudentExaminations

## Ambiguous Edges - Review These
- `Six-Step Import Wizard Stepper` → `Registry Pipeline v2.4`  [AMBIGUOUS]
  references/stitch/stitch_docversity_ui_ux_design_system/excel_bulk_import_validation/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **1679 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+1674 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2199 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CLAUDE.md — Docversity` connect `CLAUDE.md` to `examinations-view.tsx`, `curricula.ts`, `student-auth.controller.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `@nestjs/common` connect `@nestjs/common` to `api/test/helpers.ts`, `student-accounts.controller.ts`, `app.module.ts`, `auth.controller.ts`, `academic.controllers.ts`, `app.setup.ts`, `profile-requests.service.ts`, `api/package.json`, `CurrentAuth`, `student-auth.controller.ts`, `historical-documents/historical-documents.test.ts`, `activity.ts`, `student-auth/support.ts`, `document-file.ts`, `re-exams.controller.ts`, `imports/support.ts`, `curricula.controllers.ts`, `programs.service.ts`, `historical-documents.service.ts`, `RequirePermissions`, `testDb`, `imports.service.ts`, `api-config.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `6. Backend conventions (apps/api)` connect `student-auth.controller.ts` to `CLAUDE.md`, `registration-rules.ts`, `common.ts`, `app.module.ts`, `CsrfService`, `profile-requests.service.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _1679 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `examinations-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.051874366767983786 - nodes in this community are weakly interconnected._
- **Should `student-accounts/schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._