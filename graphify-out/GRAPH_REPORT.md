# Graph Report - docversity  (2026-10-10)

## Corpus Check
- 629 files · ~864,884 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 5512 nodes · 14567 edges · 193 communities (178 shown, 15 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 465 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `baea3943`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- student-accounts-view.tsx
- student-accounts/schemas.ts
- ImportsController
- config/package.json
- packages_validation_dist_index
- cn
- common.ts
- ui/package.json
- re-exam-payments.ts
- api/test/helpers.ts
- student-accounts.controller.ts
- database/package.json
- curriculum-editor-view.tsx
- QueueModule
- AuthService
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
- activity.ts
- web/package.json
- PrismaService
- tasks
- coming-soon.tsx
- Authentication
- Database Documentation
- types/package.json
- api/package.json
- errorMessage
- next
- ReExamPaymentsService
- ref_zod
- packages_types_dist_index
- re-exam-payments.service.ts
- API Documentation
- documents/package.json
- student/login/page.tsx
- server-auth.ts
- lib/api.ts
- StudentRoute
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
- testDb
- curricula.controllers.ts
- ProfileRequestsService
- Excel Bulk Import Validation Screen
- DOCVERSITY README
- SessionStore
- curricula.test.tsx
- devDependencies
- loadWebEnv
- historical-documents.service.ts
- Academic Trust Matrix design system
- compilerOptions
- login-form.tsx
- RequirePermissions
- imports/package.json
- uid
- imports/src/index.ts
- examinations/re-exam-payments.test.ts
- QR Document Scanner & Verifier Screen
- curricula.ts
- compilerOptions
- Phase 7B — Course management and curriculum versions
- ADR-0004: S3-compatible object storage (MinIO local, R2/S3 prod)
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
- profile-request-detail-view.tsx
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
- re-exam-payments.test.tsx
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
- document-detail-view.tsx
- create-admin-core.ts
- student-profile/schemas.ts
- src/env.ts
- AuthContext
- profile-requests.service.ts
- examinations/schemas.ts
- .writeAuditEvent
- Architecture Overview
- HistoricalDocumentsService
- Imports (Phase 5: students / registrations)
- ApiOperation
- AppError
- PasswordResetNotifier
- states.tsx
- StudentContext
- ExaminationsService
- PasswordResetStore
- result-fields.ts
- re-exams.test.tsx
- ReExamsService
- ref_node_url
- testing.ts
- .getHealth
- re-exam-applications/[id]/page.tsx
- fees/page.tsx
- GLOSSARY.md
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_js
- users_gugloo_docvarsity_docversity_apps_api_dist_auth_password_service_passwordservice
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_createadmin
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_create_admin_core_js
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_ensureroles
- users_gugloo_docvarsity_docversity_apps_api_dist_cli_roles_js
- historical-documents/historical-documents.test.ts
- CLAUDE.md
- historical-documents.spec.ts
- setup.ts
- Phase 8 — Historical certificates and the student document library (delivery report)
- examinations.controller.ts
- FeeRulesService
- schema/historical-documents.test.ts
- Phase 9 — External examinations, re-exam applications and regional QR payments (delivery report)
- (portal)/examinations/page.tsx

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 117 edges
2. `RequirePermissions()` - 116 edges
3. `cn()` - 116 edges
4. `next` - 110 edges
5. `AuthContext` - 88 edges
6. `CurrentAuth` - 78 edges
7. `errorMessage()` - 78 edges
8. `AppError` - 71 edges
9. `Button()` - 60 edges
10. `useCan()` - 57 edges

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

## Communities (193 total, 15 thin omitted)

### Community 0 - "student-accounts-view.tsx"
Cohesion: 0.05
Nodes (93): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+85 more)

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
Nodes (104): metadata, Field(), getError(), SelectField(), selectValue(), applyServerErrors(), useSaveAcademicSession(), EMPTY (+96 more)

### Community 5 - "cn"
Cohesion: 0.03
Nodes (95): metadata, AdminBreadcrumbs(), NavLinks(), sidebarPreference, BreadcrumbLabelProvider(), LabelContext, Setter, useBreadcrumbLabel() (+87 more)

### Community 6 - "common.ts"
Cohesion: 0.04
Nodes (66): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema, CreateAcademicSession (+58 more)

### Community 7 - "ui/package.json"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "re-exam-payments.ts"
Cohesion: 0.03
Nodes (83): isRegionGroup(), PAYMENT_REGION_GROUPS, PAYMENT_REGION_LABELS, PAYMENT_REGIONS, PaymentRegion, paymentRegionSchema, RE_EXAM_PAYMENT_STATUS_LABELS, RE_EXAM_PAYMENT_STATUSES (+75 more)

### Community 9 - "api/test/helpers.ts"
Cohesion: 0.12
Nodes (32): Detail, newStudent(), attempt(), config, postPreAuth(), as(), attemptsFromForwardedIps(), healthWith() (+24 more)

### Community 10 - "student-accounts.controller.ts"
Cohesion: 0.09
Nodes (26): error, StudentAccountsModule, Module, portalState(), RegistrationRow, rowInclude, StudentAccountsService, Injectable (+18 more)

### Community 11 - "database/package.json"
Cohesion: 0.05
Nodes (41): dependencies, @prisma/adapter-pg, @prisma/client, description, devDependencies, @docversity/config, eslint, prisma (+33 more)

### Community 12 - "curriculum-editor-view.tsx"
Cohesion: 0.06
Nodes (38): metadata, metadata, useCurricula(), useCurriculum(), components(), CurriculumEditorView(), PeriodSubjects(), move() (+30 more)

### Community 13 - "QueueModule"
Cohesion: 0.33
Nodes (4): QueueModule, Global, Inject, Module

### Community 14 - "AuthService"
Cohesion: 0.15
Nodes (4): assertPasswordPolicy(), AuthService, toAuthUser(), Injectable

### Community 15 - "worker/package.json"
Cohesion: 0.05
Nodes (42): dependencies, bullmq, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation, ioredis (+34 more)

### Community 16 - "students.ts"
Cohesion: 0.04
Nodes (49): Create / update / skip policy, Validation, curriculumRefSchema, departmentQuerySchema, updateDepartmentSchema, ActivityList, activityListSchema, CreateRegistration (+41 more)

### Community 17 - "academic.controllers.ts"
Cohesion: 0.03
Nodes (68): error, MUTATION_ERRORS, DashboardService, Injectable, CODE_CONFLICT, DepartmentRow, DepartmentsService, include (+60 more)

### Community 18 - "support/db.ts"
Cohesion: 0.13
Nodes (18): db, f, db, f, db, f, db, f (+10 more)

### Community 19 - ".login"
Cohesion: 0.19
Nodes (21): ApiAcceptedResponse, AuthController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiSecurity (+13 more)

### Community 20 - "re-exams.ts"
Cohesion: 0.04
Nodes (64): refineDestination(), verifyReExamPaymentSchema, ApproveReExamApplication, approveReExamApplicationSchema, CreateReExamApplication, createReExamApplicationSchema, CreateReExamFeeRule, CreateReExamFeeRuleInput (+56 more)

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
Cohesion: 0.06
Nodes (34): AppModule, Module, API_ROUTE_PREFIX, configureApp(), installNotFoundFallback(), LOG_LEVELS, logLevelsFor(), OPENAPI_JSON_PATH (+26 more)

### Community 26 - "activity.ts"
Cohesion: 0.09
Nodes (26): AuditRow, count(), FIELD_LABELS, fields(), plural(), status(), summarizeAudit(), viaImport() (+18 more)

### Community 27 - "web/package.json"
Cohesion: 0.07
Nodes (28): description, @docversity/config, @docversity/database, @docversity/imports, @docversity/types, @docversity/validation, eslint, globals (+20 more)

### Community 28 - "PrismaService"
Cohesion: 0.06
Nodes (25): AuditService, Injectable, PrismaService, Inject, Injectable, Inject, Inject, Inject (+17 more)

### Community 29 - "tasks"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "coming-soon.tsx"
Cohesion: 0.10
Nodes (9): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+1 more)

### Community 31 - "Authentication"
Cohesion: 0.09
Nodes (35): Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Password reset (single-use token in URL fragment), Redis unavailable → fail closed (503), Redis-backed sessions (sha256 of session id), Host-only __Host- session cookies (SameSite=Lax) (+27 more)

### Community 32 - "Database Documentation"
Cohesion: 0.07
Nodes (41): Academic audit events (safe metadata), Transactional student + registration creation, Standard error envelope (code, message, requestId), Correlation IDs and redacted JSON logs, ADR-0006 Database-enforced integrity, Certificate architecture (draft → approve → issue → revoke/supersede), TECHNICAL-AUDIT.md (legacy WordPress audit), Product Decisions Already Agreed (+33 more)

### Community 33 - "types/package.json"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "api/package.json"
Cohesion: 0.07
Nodes (28): description, bullmq, @docversity/config, @docversity/database, @docversity/imports, @docversity/storage, @docversity/types, @docversity/validation (+20 more)

### Community 35 - "errorMessage"
Cohesion: 0.04
Nodes (68): metadata, toggleStatus(), importKeys, importsApi, RUNNING_STATUSES, useImportJob(), useImportRow(), useImportRows() (+60 more)

### Community 36 - "next"
Cohesion: 0.04
Nodes (68): metadata, metadata, metadata, metadata, STATUS_LABELS, APPLICATION_STATUS, STATUS_OPTIONS, CodesDialog() (+60 more)

### Community 37 - "ReExamPaymentsService"
Cohesion: 0.07
Nodes (38): conflict(), destinationState(), isUsable(), notEditable(), PaymentDestinationsService, resolveAmount(), storageUnavailable(), toDestination() (+30 more)

### Community 38 - "ref_zod"
Cohesion: 0.05
Nodes (38): ImportLimitsEnv, importLimitsEnvSchema, QueueEnv, queueEnvSchema, EnvValidationError, parseEnv(), envBoolean, httpUrl (+30 more)

### Community 39 - "packages_types_dist_index"
Cohesion: 0.06
Nodes (50): errorResponse, AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY, CsrfMode, PERMISSIONS_KEY (+42 more)

### Community 40 - "re-exam-payments.service.ts"
Cohesion: 0.05
Nodes (50): DestinationCore, destinationInclude, DestinationRecord, person, SUMMARIES, EvidenceUploadInterceptor, QrUploadInterceptor, Injectable (+42 more)

### Community 41 - "API Documentation"
Cohesion: 0.09
Nodes (34): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Academic Masters API (Phase 4), Paginated list contract (page, pageSize, sortBy allow-list), No-deletes rule (deactivate via status), Server-side relation resolution rules, API Documentation (+26 more)

### Community 42 - "documents/package.json"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "student/login/page.tsx"
Cohesion: 0.21
Nodes (10): metadata, StudentLoginPage(), metadata, StudentRegisterPage(), StudentActivationForm(), onSubmit(), StudentLoginForm(), onSubmit() (+2 more)

### Community 44 - "server-auth.ts"
Cohesion: 0.07
Nodes (41): metadata, Page(), metadata, Page(), metadata, Page(), metadata, Page() (+33 more)

### Community 45 - "lib/api.ts"
Cohesion: 0.05
Nodes (44): metadata, QueryProvider(), sessionKeys, sessionsApi, documentKeys, RegistrationPicker(), studentAccountKeys, useInvalidate() (+36 more)

### Community 46 - "StudentRoute"
Cohesion: 0.15
Nodes (22): cookieNames, preAuthCsrfCookieOptions(), sessionCookieOptions(), clientInfo(), StudentAuthController, StudentController, ApiBody, ApiCookieAuth (+14 more)

### Community 47 - "historical-documents/schemas.ts"
Cohesion: 0.03
Nodes (58): AUTHENTICITY_LABELS, certificateNumberSchema, DOCUMENT_AUTHENTICITY, DOCUMENT_PROVENANCES, DocumentAuthenticity, documentAuthenticitySchema, DocumentDisposition, documentDispositionSchema (+50 more)

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
Cohesion: 0.13
Nodes (25): addNewSubject(), choose(), createCourse(), shared, shared, staffPage(), SERVICES, shared (+17 more)

### Community 52 - "Public Verification Portal Home Screen"
Cohesion: 0.13
Nodes (19): Bulk Verification & Institutional Access (Enterprise Gateway), Certificate Serial Format DOC-[YEAR]-[SERIAL], Certificate Verification (Conferrals & Degrees), Certified PDF Attestation (sealed PDF with audit trail and verification token), Check Results (Transcripts & Grades), Authenticated Credentials Stats Banner (148,290+ issued, 100% official, instant), Docversity Academic Registry, FERPA & GDPR Compliance (+11 more)

### Community 53 - "CsrfService"
Cohesion: 0.19
Nodes (6): Inject, normalizeOrigin(), Inject, CsrfService, Inject, Injectable

### Community 54 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @axe-core/playwright, @docversity/config, @docversity/database, @docversity/imports, eslint, globals, jsdom (+11 more)

### Community 55 - "engine.ts"
Cohesion: 0.07
Nodes (58): appendAudit(), chunks(), computeRowCounts(), dateOnly(), Db, ExistingRow, existingSelect, fromDateOnly() (+50 more)

### Community 56 - "prepare-e2e.mjs"
Cohesion: 0.09
Nodes (22): apps_api_dist_auth_password_service, apps_api_dist_auth_password_service_passwordservice, apps_api_dist_cli_create_admin_core, apps_api_dist_cli_create_admin_core_createadmin, apps_api_dist_cli_roles, apps_api_dist_cli_roles_ensureroles, loadRootEnv(), ProvidedContext (+14 more)

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
Cohesion: 0.13
Nodes (28): Staff, config, lines, activate(), activatedStudent(), Agent, cookieNamesOf(), expectStatus() (+20 more)

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
Cohesion: 0.06
Nodes (43): FeeAssessment, person, ruleInclude, RuleRecord, error, ReExamsModule, Module, AppRecord (+35 more)

### Community 66 - "testDb"
Cohesion: 0.12
Nodes (37): auditFor(), testDb(), config, registrationsWith(), validatedImport(), config, mixedWorkbook(), validated() (+29 more)

### Community 67 - "curricula.controllers.ts"
Cohesion: 0.07
Nodes (33): error, NOT_EDITABLE, curriculumKeys, useInvalidateCurricula(), subjectKeys, subjectsApi, packages_validation_dist_index_addcurriculumsubject, packages_validation_dist_index_addcurriculumsubjectschema (+25 more)

### Community 68 - "ProfileRequestsService"
Cohesion: 0.19
Nodes (7): imageContentType(), notPending(), ProfileRequestsService, proposedOf(), snapshotFromJson(), snapshotOf(), Injectable

### Community 69 - "Excel Bulk Import Validation Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "DOCVERSITY README"
Cohesion: 0.10
Nodes (31): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+23 more)

### Community 71 - "SessionStore"
Cohesion: 0.26
Nodes (4): sha256(), parseRecord(), SessionStore, Injectable

### Community 72 - "curricula.test.tsx"
Cohesion: 0.09
Nodes (36): CURRICULUM_ADMIN, program, READER, serveCurriculum(), department, EXAM_ADMIN, program, READER (+28 more)

### Community 73 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+6 more)

### Community 74 - "loadWebEnv"
Cohesion: 0.18
Nodes (10): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), loadWebEnv(), config (+2 more)

### Community 75 - "historical-documents.service.ts"
Cohesion: 0.03
Nodes (86): assertStaticPdf(), DocumentContentType, FORBIDDEN_PDF_NAMES, inspectDocument(), InspectedDocument, InspectionRules, invalid(), pdfNames() (+78 more)

### Community 76 - "Academic Trust Matrix design system"
Cohesion: 0.13
Nodes (25): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration, cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui) (+17 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "login-form.tsx"
Cohesion: 0.20
Nodes (13): AdminLoginPage(), metadata, ProtectedAdminLayout(), AdminShell(), LoginForm(), onSubmit(), textField(), ApiErrorBody (+5 more)

### Community 79 - "RequirePermissions"
Cohesion: 0.14
Nodes (23): AcademicSessionsController, DashboardController, DepartmentsController, ProgramsController, RegistrationsController, StudentsController, ApiBody, ApiCookieAuth (+15 more)

### Community 80 - "imports/package.json"
Cohesion: 0.05
Nodes (38): dependencies, @docversity/database, @docversity/storage, @docversity/types, @docversity/validation, exceljs, description, devDependencies (+30 more)

### Community 81 - "uid"
Cohesion: 0.24
Nodes (15): db, draftCurriculum(), f, uid(), fixtures(), examContext(), examination(), issuedCertificate() (+7 more)

### Community 82 - "imports/src/index.ts"
Cohesion: 0.11
Nodes (28): RFC-9562, ContainerEntry, ContainerLimits, inspectXlsxContainer(), OLE_SIGNATURE, verifyXlsxContainer(), transitionImportJob(), actionRequired() (+20 more)

### Community 83 - "examinations/re-exam-payments.test.ts"
Cohesion: 0.07
Nodes (39): activeCurriculum(), add(), course(), curriculum(), detailOf(), registrationIn(), subject(), Agent (+31 more)

### Community 84 - "QR Document Scanner & Verifier Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "curricula.ts"
Cohesion: 0.03
Nodes (68): ACADEMIC_STRUCTURES, AcademicStructure, AddCurriculumSubject, AddCurriculumSubjectInput, addCurriculumSubjectSchema, AssessmentComponent, assessmentComponentSchema, AssignCurriculum (+60 more)

### Community 86 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Phase 7B — Course management and curriculum versions"
Cohesion: 0.20
Nodes (10): Acceptance fixes, Complete final specification acceptance matrix, Evidence and verification, Historical integrity and migrations, Implemented, Limitations and university decisions, Manual acceptance checklist, Phase 7B — Course management and curriculum versions (+2 more)

### Community 88 - "ADR-0004: S3-compatible object storage (MinIO local, R2/S3 prod)"
Cohesion: 0.16
Nodes (14): ADR-0001: pnpm workspaces + Turborepo monorepo, minimumReleaseAge supply-chain gate, pnpm workspaces, Turborepo task graph, ADR-0004: S3-compatible object storage (MinIO local, R2/S3 prod), Chainguard MinIO image (pinned by digest), ObjectStorage port / S3ObjectStorage, Private buckets with short-lived presigned URLs (+6 more)

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

### Community 99 - "profile-request-detail-view.tsx"
Cohesion: 0.16
Nodes (14): metadata, profileRequestKeys, profileRequestPhotoUrl(), profileRequestsApi, useApproveProfileRequest(), useInvalidateAfterDecision(), useProfileRequest(), useRejectProfileRequest() (+6 more)

### Community 100 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "student-rows.ts"
Cohesion: 0.07
Nodes (36): NormalizedResultRow, parseNumericMark(), parseResultFieldValues(), ResultExistingRegistration, ResultFieldValues, ResultProgramSubject, ResultRowOutcome, ResultValidationContext (+28 more)

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
Nodes (42): error, STEP_ERRORS, ACCEPTED_MIME_TYPES, DownloadFile, iso(), jobInclude, JobRow, STATUS_WORDS (+34 more)

### Community 112 - "ui/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "test/registration-2025.test.ts"
Cohesion: 0.09
Nodes (28): ExistingRegistration, ReferenceData, StudentValidationContext, ARCHIVED, DEPT, existingRegistration(), INACTIVE_DEPT, INACTIVE_PROGRAM (+20 more)

### Community 114 - "development-fixtures.ts"
Cohesion: 0.18
Nodes (11): packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prismaclient, DEV_FIXTURE_LABEL, PROGRAMS, seedDevelopmentFixtures(), SeedSummary, STUDENTS, SUBJECTS (+3 more)

### Community 115 - ".prettierrc.json"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 116 - "@docversity/config shared tooling configuration"
Cohesion: 0.67
Nodes (3): @docversity/config shared tooling configuration, Shared ESLint configs (base/node/nextjs) + Prettier formatting, Shared TypeScript configs (base/node/nestjs/nextjs)

### Community 122 - "workbook.ts"
Cohesion: 0.15
Nodes (23): BLANK, cellDisplay(), dateToIso(), isRecord(), plainResult(), richText(), SourceCell, toSourceCell() (+15 more)

### Community 123 - "@nestjs/common"
Cohesion: 0.04
Nodes (77): AcademicModule, Module, AuditModule, Global, Module, Inject, AuthModule, Global (+69 more)

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

### Community 128 - "re-exam-payments.test.tsx"
Cohesion: 0.17
Nodes (10): CONFIGURER, destination, detail, REVIEWER, VERIFIER, packages_validation_dist_index_paymentdestinationdetail, packages_validation_dist_index_paymentdestinationlist, packages_validation_dist_index_reexampaymentdetail (+2 more)

### Community 129 - "CLAUDE.md — Docversity"
Cohesion: 0.06
Nodes (30): 10. Authentication boundaries, 10a. Student profile change requests (Phase 7), 10b. Course and curriculum management (Phase 7B), 10c. Historical documents (Phase 8), 10d. Examinations (Phase 9), 11. Student import workflow (Phase 5), 12. API conventions, 13. Security and privacy rules (non-negotiable) (+22 more)

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

### Community 144 - "client.ts"
Cohesion: 0.16
Nodes (14): checkDatabaseConnection(), createPrismaClient(), CreatePrismaClientOptions, packages_database_src_index_prismaclient, LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions (+6 more)

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
Cohesion: 0.12
Nodes (23): bullmqConnection(), createWorkers(), CreateWorkersOptions, importProcessor(), loadRootEnv(), loadWorkerEnv(), processHealthTestJob(), log() (+15 more)

### Community 149 - "database/src/index.ts"
Cohesion: 0.29
Nodes (9): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client_prisma, packages_database_src_generated_prisma_models (+1 more)

### Community 150 - "document-detail-view.tsx"
Cohesion: 0.08
Nodes (28): metadata, documentFileUrl(), useHistoricalDocument(), DialogKind, DocumentDetailView(), Preview(), versionLink(), Versions() (+20 more)

### Community 151 - "create-admin-core.ts"
Cohesion: 0.20
Nodes (13): createAdmin(), CreateAdminError, CreateAdminInput, main(), prompt(), promptHidden(), rootEnv, ensureRoles() (+5 more)

### Community 152 - "student-profile/schemas.ts"
Cohesion: 0.05
Nodes (38): approveProfileRequestSchema, fieldChangeSchema, GENDER_OPTIONS, isPlausibleDateOfBirth(), MAX_STUDENT_AGE_YEARS, MIN_STUDENT_AGE_YEARS, photoInfoSchema, PROFILE_FIELD_LABELS (+30 more)

### Community 153 - "src/env.ts"
Cohesion: 0.09
Nodes (23): main(), rootEnv, backfillStudentCopies(), { IMPORT_MAX_FILE_MB }, nextConfig, rootEnvFile, securityHeaders, WebEnv (+15 more)

### Community 154 - "AuthContext"
Cohesion: 0.19
Nodes (22): MutationDocs(), CurriculaController, ProgramCurriculaController, StudentCurriculumController, SubjectsController, ApiBody, ApiCookieAuth, ApiCreatedResponse (+14 more)

### Community 155 - "profile-requests.service.ts"
Cohesion: 0.06
Nodes (36): UuidParamPipe, PhotoUploadInterceptor, Injectable, UploadedPhoto, FORMATS, invalid(), ProcessedPhoto, processProfilePhoto() (+28 more)

### Community 156 - "examinations/schemas.ts"
Cohesion: 0.05
Nodes (37): CreateExamination, CreateExaminationInput, createExaminationSchema, CreateExternalExamApp, CreateExternalExamAppInput, createExternalExamAppSchema, examAppFields, EXAMINATION_KIND_LABELS (+29 more)

### Community 157 - ".writeAuditEvent"
Cohesion: 0.14
Nodes (11): componentsJson(), componentsOf(), CurriculaService, notEditable(), num(), rangesOverlap(), toAssignment(), toDetail() (+3 more)

### Community 158 - "Architecture Overview"
Cohesion: 0.15
Nodes (21): Student photo upload deferred, Frontend Animation Rules, Framer Motion (default UI motion), GSAP (timeline-heavy special effects only), No animation in admin data views / verification results, Respect prefers-reduced-motion, Initial Stitch Migration Plan (archived), grading module (pure calculation engine) (+13 more)

### Community 159 - "HistoricalDocumentsService"
Cohesion: 0.08
Nodes (36): DocumentUploadRequest, UploadedDocument, HistoricalDocumentsController, multipartDoc(), send(), StudentDocumentsController, ApiBody, ApiConsumes (+28 more)

### Community 160 - "Imports (Phase 5: students / registrations)"
Cohesion: 0.18
Nodes (11): Audit, Commit and idempotency, Flow, Imports (Phase 5: students / registrations), Known limitations, Limits and production tuning, Retries and failures, Security (+3 more)

### Community 161 - "ApiOperation"
Cohesion: 0.20
Nodes (18): FeeRulesController, ReExamApplicationsController, StudentReExamsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation (+10 more)

### Community 162 - "AppError"
Cohesion: 0.05
Nodes (68): AcademicSessionsService, CODE_CONFLICT, include, SessionRow, toSession(), Injectable, ASSIGNMENT_ORDER, AssignmentRow (+60 more)

### Community 163 - "PasswordResetNotifier"
Cohesion: 0.25
Nodes (4): PasswordResetNotifier, Injectable, UnconfiguredPasswordResetNotifier, TestAppOptions

### Community 164 - "states.tsx"
Cohesion: 0.04
Nodes (61): metadata, metadata, metadata, metadata, metadata, metadata, metadata, useSetBreadcrumbLabel() (+53 more)

### Community 165 - "StudentContext"
Cohesion: 0.14
Nodes (26): CurrentStudent, StudentContext, PhotoUploadRequest, parseSubmission(), ProfileRequestsController, StudentProfileController, ApiBody, ApiConsumes (+18 more)

### Community 166 - "ExaminationsService"
Cohesion: 0.10
Nodes (25): ExaminationAppsController, ExaminationsController, StudentExaminationsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation (+17 more)

### Community 168 - "result-fields.ts"
Cohesion: 0.29
Nodes (5): RESULT_IMPORT_FIELD_KEYS, RESULT_IMPORT_FIELDS, resultImportField, ResultImportFieldDefinition, ResultImportFieldKind

### Community 169 - "re-exams.test.tsx"
Cohesion: 0.20
Nodes (9): application, DECIDER, FINANCE, options, READER, packages_validation_dist_index_reexamapplicationdetail, packages_validation_dist_index_reexamfeerule, packages_validation_dist_index_studentreexamapplication (+1 more)

### Community 170 - "ReExamsService"
Cohesion: 0.15
Nodes (6): latestPaymentSummary(), conflict(), csvCell(), feeData(), ReExamsService, Injectable

### Community 171 - "ref_node_url"
Cohesion: 0.10
Nodes (17): e2eDatabaseUrl, isCI, rootEnv, rootEnvFile, admin, { Client }, db, pgRequire (+9 more)

### Community 172 - "testing.ts"
Cohesion: 0.08
Nodes (22): "Registration 2025.xlsx" — column mapping report, What an import of this file needs (once authorised), calendarDate(), DateParse, FORMAT_HINT, pad(), parseDateCell(), parseDateText() (+14 more)

### Community 173 - ".getHealth"
Cohesion: 0.33
Nodes (5): ApiServiceUnavailableResponse, ApiOkResponse, ApiOperation, Get, Res

### Community 174 - "re-exam-applications/[id]/page.tsx"
Cohesion: 0.33
Nodes (4): metadata, useReExamApplication(), ReExamApplicationDetailView(), feeText()

### Community 175 - "fees/page.tsx"
Cohesion: 0.40
Nodes (3): metadata, useFeeRules(), FeeRulesView()

### Community 183 - "historical-documents/historical-documents.test.ts"
Cohesion: 0.11
Nodes (29): Agent, detailOf(), draftFor(), fileOf(), FilePart, imageDraft(), legacyImageRow(), metadata() (+21 more)

### Community 184 - "CLAUDE.md"
Cohesion: 0.08
Nodes (18): Assignment and lifecycle, Course curricula (Phase 7B), Validation, roles and audit, Imports API (`/api/v1/imports`), Blockers found in the existing schema and policy, Manual marks entry — design foundation (Phase 9, Part F), Proposed data contract for manual entry (Phase 10), What already exists (Phase 2 schema, unchanged) (+10 more)

### Community 185 - "historical-documents.spec.ts"
Cohesion: 0.19
Nodes (11): studentPage(), choose(), EXIF_VALUES, exifSegment(), scanWithExif(), shared, staffPage(), studentPage() (+3 more)

### Community 188 - "Phase 8 — Historical certificates and the student document library (delivery report)"
Cohesion: 0.10
Nodes (18): Audit, File responses, Historical documents and the student document library (Phase 8), Lifecycle, Student endpoints (student session), ADR-0013: Historical documents are staff-managed evidence, separate from issued credentials, Amendment 1 (2026-10-09, pre-merge hardening), Consequences (+10 more)

### Community 189 - "examinations.controller.ts"
Cohesion: 0.09
Nodes (31): error, AppRecord, CODE_CONFLICT, examInclude, ExamRecord, SUMMARIES, toRow(), examinationKeys (+23 more)

### Community 191 - "FeeRulesService"
Cohesion: 0.31
Nodes (4): conflict(), FeeRulesService, toRule(), Injectable

### Community 193 - "schema/historical-documents.test.ts"
Cohesion: 0.39
Nodes (6): db, draft(), f, imageDraft(), sha(), staffUser()

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
- **1794 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+1789 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2360 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CLAUDE.md — Docversity` connect `CLAUDE.md — Docversity` to `CLAUDE.md`, `student-accounts-view.tsx`, `packages_types_dist_index`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `student-accounts-view.tsx`, `packages_validation_dist_index`, `cn`, `curriculum-editor-view.tsx`, `document-detail-view.tsx`, `src/env.ts`, `web/package.json`, `coming-soon.tsx`, `errorMessage`, `states.tsx`, `student/login/page.tsx`, `server-auth.ts`, `lib/api.ts`, `re-exam-applications/[id]/page.tsx`, `fees/page.tsx`, `(portal)/examinations/page.tsx`, `loadWebEnv`, `login-form.tsx`, `app/layout.tsx`, `profile-request-detail-view.tsx`, `(public)/page.tsx`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `6. Backend conventions (apps/api)` connect `packages_types_dist_index` to `CLAUDE.md — Docversity`, `AppError`, `registration-rules.ts`, `common.ts`, `PrismaService`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _1794 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `student-accounts-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04792299898682877 - nodes in this community are weakly interconnected._
- **Should `student-accounts/schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._