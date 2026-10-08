# Graph Report - docversity  (2026-10-08)

## Corpus Check
- 348 files · ~323,461 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 2, .example 1)

## Summary
- 2468 nodes · 5255 edges · 122 communities (117 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 185 edges (avg confidence: 0.83)
- Token cost: 687,841 input · 0 output

## Community Hubs (Navigation)
- Admin Route Pages
- API Auth Decorators & Module
- Academic Controllers (OpenAPI)
- Shared ESLint Config
- Form Fields & Server Errors
- Admin Data Table Components
- Academic Validation Common
- UI Package Dependencies
- Health Checks & Timeouts
- API Academic & Audit Tests
- Admin & Public Shells
- Database Package Manifest
- OpenAPI List Query Plumbing
- Audit Module & Dashboard
- AuthService Login Flow
- Worker Package Manifest
- Student & Registration Schemas
- BullMQ Worker Runtime
- Database Schema Tests
- AuthController Endpoints
- API Bootstrap & Swagger
- Root Workspace Manifest
- Auth Zod Schemas
- Audit Action Types
- Validation Package Manifest
- Academic Sessions Service
- Audit Activity Summaries
- Web Package Manifest
- Dashboard & Student Pages
- Turbo Task Pipeline
- Public Info Pages
- Auth Design & Threat Model
- Database Design Docs
- Types Package Manifest
- API Package Manifest
- Programs Service
- Web Query Providers & APIs
- Auth Client Info & Errors
- Env Parsing
- Departments Service
- AuthGuard & Sessions
- Frontend Architecture Docs
- Documents Package Manifest
- Password Reset Notifier
- Admin CLI & E2E Fixtures
- Error & Health Schemas
- AppModule Wiring
- Password Reset Store
- Breadcrumbs
- TS Base Config
- Stitch Certificate Registry Screen
- Playwright E2E Specs
- Stitch Public Portal Screen
- CSRF Guard
- Web Dev Dependencies
- Academic Session Schemas
- Prisma Client & Test DB
- shadcn Components Config
- Stitch Result Verification Screen
- API Runtime Dependencies
- Academic Sessions Rows & Keys
- Web Runtime Dependencies
- UI Primitives & Login Form
- TS Next.js Config
- Stitch Admin Dashboard Screen
- JSON Logger
- Student Detail View
- API Docs
- Prisma Client & Seed Fixtures
- Stitch Excel Import Screen
- CI & Docker Compose
- Next Config & Web Env
- Web Unit Tests
- API Dev Dependencies
- Dev Status Page
- Validation Barrel Exports
- Stitch Design System
- Worker Build Config
- Admin Login & Server Auth
- Architecture Overview
- Product Decisions
- Repo README Topology
- ADR-0008 Admin Frontend
- Database Error Mapping
- Stitch QR Scanner Screen
- Audit & Prisma Services
- API Build Config
- Animation Rules & Migration Plan
- Monorepo & Toolchain ADRs
- TS NestJS Config
- Nest CLI Config
- API Scripts
- Web Scripts
- Root Layout & Fonts
- Worker TS Config
- TS Node Config
- Documents Build Config
- Types Build Config
- Validation Build Config
- Legacy Login API Client
- Web TS Config
- Authorization Guards Doc
- API & Storage ADRs
- Database Build Config
- API TS Config
- Public Home Page
- Worker ADR & Shared Packages
- Database TS Config
- Documents TS Config
- Types TS Config
- Validation TS Config
- Documents Rendering Rules
- UI TS Config
- DB Integrity ADR
- Session Auth ADR
- Prettier Config
- Config Package Docs
- API Vitest SWC
- MinIO Entrypoint
- MinIO Init

## God Nodes (most connected - your core abstractions)
1. `cn()` - 98 edges
2. `@nestjs/common` - 62 edges
3. `next` - 36 edges
4. `ApiConfig` - 34 edges
5. `AuthContext` - 29 edges
6. `RequirePermissions()` - 28 edges
7. `Database Documentation` - 27 edges
8. `PrismaService` - 26 edges
9. `DOCVERSITY README` - 26 edges
10. `SessionStore` - 24 edges

## Surprising Connections (you probably didn't know these)
- `@docversity/validation Zod schemas` --semantically_similar_to--> `Shared Zod schemas for React Hook Form and API`  [INFERRED] [semantically similar]
  packages/validation/README.md → docs/decisions/ADR-0008-admin-frontend.md
- `Folders stay empty until real features exist` --semantically_similar_to--> `No control ships without behaviour`  [INFERRED] [semantically similar]
  apps/web/src/README.md → docs/architecture/stitch-migration.md
- `Certificate Management Preview screen` --conceptually_related_to--> `Template = code-defined layout + DB configuration`  [INFERRED]
  references/stitch/stitch_docversity_ui_ux_design_system/certificate_management_preview/code.html → packages/documents/README.md
- `QR Document Scanner Verifier screen` --conceptually_related_to--> `QR codes encode only an opaque verification URL`  [INFERRED]
  references/stitch/stitch_docversity_ui_ux_design_system/qr_document_scanner_verifier/code.html → packages/documents/README.md
- `theme.css Tailwind v4 tokens` --semantically_similar_to--> `Palette: Royal Blue #0759D7, Heritage Navy #071F4A, Seal Gold #D4AF7A, status emerald/ruby/amber`  [INFERRED] [semantically similar]
  packages/ui/README.md → references/stitch/stitch_docversity_ui_ux_design_system/academic_trust_matrix/DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Global guard chain (Auth → CSRF → Permissions)** — docs_architecture_authorization_authguard, docs_architecture_authorization_csrfguard, docs_architecture_authorization_permissionsguard, docs_architecture_authentication_redis_sessions, docs_architecture_authorization_permissions [EXTRACTED 1.00]
- **Single authoritative certificate record incl. legacy QR compatibility** — docs_architecture_product_decisions_one_authoritative_certificate_record, docs_database_readme_certificate_source_of_truth, docs_database_readme_certificates_table, docs_database_readme_legacy_mappings_table, docs_architecture_product_decisions_historic_qr_compatibility, docs_architecture_product_decisions_legacy_wordpress_system [INFERRED 0.85]
- **Shared Zod contract across API, OpenAPI and web forms** — readme_packages_validation, docs_api_readme_zod_openapi_single_source, docs_api_readme_swagger, docs_architecture_frontend_api_client, docs_architecture_frontend_react_hook_form_shared_zod [INFERRED 0.85]
- **Shared workspace packages consumed by web, API and worker** — packages_config_readme_docversity_config, packages_documents_readme_docversity_documents, packages_types_readme_docversity_types, packages_ui_readme_docversity_ui, packages_validation_readme_docversity_validation [INFERRED 0.85]
- **Core architecture split: Next.js UI, NestJS API, BullMQ worker, object storage, Redis sessions** — docs_decisions_adr_0002_separate_api_nextjs_ui_only, docs_decisions_adr_0002_separate_api_nestjs_rest_api, docs_decisions_adr_0003_background_worker_bullmq_worker, docs_decisions_adr_0004_object_storage_objectstorage_port, docs_decisions_adr_0007_authentication_sessions_redis_sessions, docs_decisions_adr_0006_database_enforced_integrity_database_enforced_integrity [INFERRED 0.85]
- **Stitch reference screens implementing Academic Trust Matrix** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_code_screen, references_stitch_stitch_docversity_ui_ux_design_system_academic_trust_matrix_design_academic_trust_matrix [INFERRED 0.85]
- **Record Trust & Authenticity Signals** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_verification_status_banner, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_verification_ref_qr_block, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_registrar_ratification_badge, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_institutional_verification_hash, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_academic_ledger [INFERRED 0.85]
- **Grade Computation & Summary** — references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_marks_credits_table, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_ugc_cbcs_grading_scale, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_sgpa_cgpa, references_stitch_stitch_docversity_ui_ux_design_system_academic_result_verification_detail_screen_result_summary_kpi_cards [INFERRED 0.85]
- **Credential lifecycle: import results, issue certificates, verify** — references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_imports_panel, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_certificates_panel, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_recent_verification_activity [INFERRED 0.85]
- **Integrity and trust signals** — references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_vault_integrity_hash, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_tamper_evident_verification, references_stitch_stitch_docversity_ui_ux_design_system_admin_registry_dashboard_screen_registry_audit_log [INFERRED 0.75]
- **Credential Tamper-Evidence Stack** — references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_sha256_document_hashing, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_hardware_hsm_sealing, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_pki_digital_signatures, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_arweave_storage_node, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_foil_watermark_security [INFERRED 0.85]
- **Certificate Master-Detail Management Workflow** — references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_registry_master_ledger, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_parchment_renderer, references_stitch_stitch_docversity_ui_ux_design_system_certificate_management_preview_screen_immediate_operations_panel [INFERRED 0.85]
- **Bulk import validation pipeline (mapping, rules, error review, atomic commit)** — references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_intelligent_column_mapping, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_academic_rules_enforced, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_error_review_table, references_stitch_stitch_docversity_ui_ux_design_system_excel_bulk_import_validation_screen_atomic_transaction_import [INFERRED 0.85]
- **Public Verification Services** — references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_check_results_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_registration_verification_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_certificate_verification_service, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_qr_scan_service [EXTRACTED 1.00]
- **Three-Step Verification Protocol** — references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_hero_record_search, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_sha256_ledger_query, references_stitch_stitch_docversity_ui_ux_design_system_public_verification_portal_home_screen_certified_pdf_attestation [INFERRED 0.85]
- **Credential Trust Guarantees (feature cards)** — references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_ecc200_cryptogram, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_immutable_timestamp, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_ferpa_gdpr_clean [EXTRACTED 1.00]
- **Document Verification Paths (scan, serial, registrar escalation)** — references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_live_optical_scan_viewport, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_manual_token_resolution, references_stitch_stitch_docversity_ui_ux_design_system_qr_document_scanner_verifier_screen_verification_protocol_notice [INFERRED 0.85]

## Communities (122 total, 5 thin omitted)

### Community 0 - "Admin Route Pages"
Cohesion: 0.06
Nodes (48): metadata, metadata, metadata, metadata, metadata, DataTable(), Pagination(), RowActions() (+40 more)

### Community 1 - "API Auth Decorators & Module"
Cohesion: 0.06
Nodes (45): AUTH_MODE_KEY, AuthenticatedRequest, AuthenticatedUser, AuthMode, CSRF_MODE_KEY, CsrfMode, PERMISSIONS_KEY, AuthModule (+37 more)

### Community 2 - "Academic Controllers (OpenAPI)"
Cohesion: 0.11
Nodes (33): ApiCreatedResponse, AcademicSessionsController, DashboardController, DepartmentsController, MutationDocs(), ProgramsController, RegistrationsController, StudentsController (+25 more)

### Community 3 - "Shared ESLint Config"
Cohesion: 0.05
Nodes (43): baseConfig(), nextjsConfig(), nodeConfig(), dependencies, eslint-config-prettier, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react (+35 more)

### Community 4 - "Form Fields & Server Errors"
Cohesion: 0.11
Nodes (40): Field(), getError(), SelectField(), selectValue(), applyServerErrors(), useSaveAcademicSession(), EMPTY, SessionDialog() (+32 more)

### Community 5 - "Admin Data Table Components"
Cohesion: 0.08
Nodes (40): FilterSelect(), RowAction, Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage() (+32 more)

### Community 6 - "Academic Validation Common"
Cohesion: 0.06
Nodes (45): AcademicSessionStatus, ActivityItem, activityItemSchema, atLeastOneField(), blankToUndefined(), codeSchema, dateOnlySchema, listQuerySchema() (+37 more)

### Community 7 - "UI Package Dependencies"
Cohesion: 0.04
Nodes (46): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, sonner, tailwind-merge, description (+38 more)

### Community 8 - "Health Checks & Timeouts"
Cohesion: 0.07
Nodes (25): ApiServiceUnavailableResponse, TimeoutError, withTimeout(), HealthController, ApiOkResponse, ApiOperation, ApiTags, Controller (+17 more)

### Community 9 - "API Academic & Audit Tests"
Cohesion: 0.14
Nodes (26): auditFor(), Detail, newStudent(), attempt(), config, postPreAuth(), as(), attemptsFromForwardedIps() (+18 more)

### Community 10 - "Admin & Public Shells"
Cohesion: 0.08
Nodes (27): AdminShell(), NavLinks(), sidebarPreference, isNavActive(), DocversityMark(), Wordmark(), PUBLIC_NAV, LINKS (+19 more)

### Community 11 - "Database Package Manifest"
Cohesion: 0.05
Nodes (41): dependencies, @prisma/adapter-pg, @prisma/client, description, devDependencies, @docversity/config, eslint, prisma (+33 more)

### Community 12 - "OpenAPI List Query Plumbing"
Cohesion: 0.06
Nodes (35): error, MUTATION_ERRORS, openApiRequestSchema(), UuidParamPipe, studentKeys, studentsApi, packages_validation_dist_index_academicsessionqueryschema, packages_validation_dist_index_activitylist (+27 more)

### Community 13 - "Audit Module & Dashboard"
Cohesion: 0.09
Nodes (28): AuditModule, Global, Module, AuditEvent, createAdmin(), CreateAdminError, CreateAdminInput, main() (+20 more)

### Community 14 - "AuthService Login Flow"
Cohesion: 0.10
Nodes (13): assertPasswordPolicy(), AuthService, Inject, Injectable, ARGON2_PARAMETERS, PasswordService, RateLimiter, Injectable (+5 more)

### Community 15 - "Worker Package Manifest"
Cohesion: 0.06
Nodes (35): dependencies, bullmq, @docversity/types, @docversity/validation, ioredis, zod, description, devDependencies (+27 more)

### Community 16 - "Student & Registration Schemas"
Cohesion: 0.06
Nodes (35): ActivityList, activityListSchema, CreateRegistration, CreateRegistrationInput, createRegistrationSchema, CreateStudent, CreateStudentInput, NewRegistration (+27 more)

### Community 17 - "BullMQ Worker Runtime"
Cohesion: 0.11
Nodes (26): bullmqConnection(), createWorkers(), CreateWorkersOptions, loadRootEnv(), loadWorkerEnv(), WorkerEnv, workerEnvSchema, processHealthTestJob() (+18 more)

### Community 18 - "Database Schema Tests"
Cohesion: 0.13
Nodes (27): seedDevelopmentFixtures(), db, f, db, f, db, f, db (+19 more)

### Community 19 - "AuthController Endpoints"
Cohesion: 0.18
Nodes (24): ApiAcceptedResponse, ApiResponse, ApiSecurity, AuthController, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation (+16 more)

### Community 20 - "API Bootstrap & Swagger"
Cohesion: 0.09
Nodes (26): API_ROUTE_PREFIX, configureApp(), LOG_LEVELS, OPENAPI_JSON_PATH, SWAGGER_PATH, accessLogMiddleware(), logger, ErrorDetail (+18 more)

### Community 21 - "Root Workspace Manifest"
Cohesion: 0.06
Nodes (32): description, devDependencies, prettier, turbo, typescript, engines, node, typescript (+24 more)

### Community 22 - "Auth Zod Schemas"
Cohesion: 0.08
Nodes (27): AuthUser, authUserSchema, ChangePasswordRequest, changePasswordRequestSchema, csrfTokenResponseSchema, emailSchema, ForgotPasswordRequest, forgotPasswordRequestSchema (+19 more)

### Community 23 - "Audit Action Types"
Cohesion: 0.08
Nodes (24): ACADEMIC_AUDIT_ACTIONS, AUDIT_ACTIONS, AuditAction, packages_types_src_index_all_permissions, packages_types_src_index_permissions, packages_types_src_index_permissionsforroles, packages_types_src_index_role_names, packages_types_src_index_role_permissions (+16 more)

### Community 24 - "Validation Package Manifest"
Cohesion: 0.07
Nodes (28): dependencies, zod, description, devDependencies, @docversity/config, eslint, @types/node, typescript (+20 more)

### Community 25 - "Academic Sessions Service"
Cohesion: 0.13
Nodes (12): AcademicSessionsService, toSession(), Injectable, resolveRegistrationRelations(), RegistrationsService, toRegistration(), Injectable, StudentsService (+4 more)

### Community 26 - "Audit Activity Summaries"
Cohesion: 0.10
Nodes (21): AuditRow, FIELD_LABELS, fields(), status(), summarizeAudit(), RelationInput, ResolvedRelations, REGISTRATION_NUMBER_CONFLICT (+13 more)

### Community 27 - "Web Package Manifest"
Cohesion: 0.07
Nodes (27): description, @docversity/config, @docversity/database, @docversity/types, @docversity/validation, eslint, globals, lucide-react (+19 more)

### Community 28 - "Dashboard & Student Pages"
Cohesion: 0.13
Nodes (18): metadata, metadata, PageHeader(), SessionContext, useCan(), useSessionUser(), DashboardView(), useCreateStudent() (+10 more)

### Community 29 - "Turbo Task Pipeline"
Cohesion: 0.07
Nodes (27): agentGuidance, dependsOn, outputs, cache, inputs, outputs, cache, dependsOn (+19 more)

### Community 30 - "Public Info Pages"
Cohesion: 0.12
Nodes (10): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+2 more)

### Community 31 - "Auth Design & Threat Model"
Cohesion: 0.11
Nodes (26): Redis 7.4 service, Authentication endpoints (/api/v1/auth/*), Authentication, pnpm admin:create (first admin), Argon2id password hashing, CSRF protection (session HMAC token + signed double-submit), Login rate limiting (fixed-window Redis counters), Password reset (single-use token in URL fragment) (+18 more)

### Community 32 - "Database Design Docs"
Cohesion: 0.12
Nodes (26): Academic audit events (safe metadata), Transactional student + registration creation, Certificate architecture (draft → approve → issue → revoke/supersede), Public result lookup (registration number + unconfirmed second identifier), Unresolved Client Decisions (Schema Impact), Certificate numbering format (open question), Exact grading rules (open question), Legacy WordPress reconciliation (open question) (+18 more)

### Community 33 - "Types Package Manifest"
Cohesion: 0.08
Nodes (25): description, devDependencies, @docversity/config, eslint, @types/node, typescript, vitest, exports (+17 more)

### Community 34 - "API Package Manifest"
Cohesion: 0.08
Nodes (24): description, @docversity/config, @docversity/database, @docversity/types, @docversity/validation, eslint, ioredis, @types/node (+16 more)

### Community 35 - "Programs Service"
Cohesion: 0.13
Nodes (13): assertActiveDepartment(), CODE_CONFLICT, include, ProgramRow, ProgramsService, toProgram(), Injectable, rethrowAsFieldConflict() (+5 more)

### Community 36 - "Web Query Providers & APIs"
Cohesion: 0.12
Nodes (18): UserMenu(), signOut(), QueryProvider(), programKeys, programsApi, ApiError, apiRequest(), buildUrl() (+10 more)

### Community 37 - "Auth Client Info & Errors"
Cohesion: 0.10
Nodes (19): errorResponse, ClientInfo, toAuthUser(), summariseUserAgent(), ZodValidationPipe, UserForAuth, packages_types_dist_index_permissionsforroles, packages_validation_dist_index_changepasswordrequest (+11 more)

### Community 38 - "Env Parsing"
Cohesion: 0.11
Nodes (18): EnvValidationError, parseEnv(), envBoolean, httpUrl, logLevelSchema, nodeEnvSchema, port, DatabaseEnv (+10 more)

### Community 39 - "Departments Service"
Cohesion: 0.11
Nodes (16): CODE_CONFLICT, DepartmentRow, DepartmentsService, include, toDepartment(), Injectable, changedFields(), departmentKeys (+8 more)

### Community 40 - "AuthGuard & Sessions"
Cohesion: 0.21
Nodes (7): AuthGuard, Inject, Injectable, sha256(), parseRecord(), SessionStore, Injectable

### Community 41 - "Frontend Architecture Docs"
Cohesion: 0.12
Nodes (23): apps/web/src README, Folders stay empty until real features exist, Planned App Router route groups (public, auth, admin), Paginated list contract (page, pageSize, sortBy allow-list), Frontend, AdminShell (protected admin layout), List state in the URL, Client-agreed palette tokens (WCAG AA) (+15 more)

### Community 42 - "Documents Package Manifest"
Cohesion: 0.09
Nodes (22): description, devDependencies, @docversity/config, eslint, @types/node, typescript, exports, files (+14 more)

### Community 43 - "Password Reset Notifier"
Cohesion: 0.12
Nodes (15): PASSWORD_RESET_NOTIFIER, PasswordResetNotifier, Injectable, UnconfiguredPasswordResetNotifier, Agent, CLOSED_PORT_HOST, HasBody, healthOf() (+7 more)

### Community 44 - "Admin CLI & E2E Fixtures"
Cohesion: 0.10
Nodes (17): apps_api_dist_auth_password_service, apps_api_dist_auth_password_service_passwordservice, apps_api_dist_cli_create_admin_core, apps_api_dist_cli_create_admin_core_createadmin, apps_api_dist_cli_roles, apps_api_dist_cli_roles_ensureroles, credentials, db (+9 more)

### Community 45 - "Error & Health Schemas"
Cohesion: 0.11
Nodes (16): ERROR_CODES, ErrorCode, ErrorResponse, errorResponseSchema, HealthResponse, healthResponseSchema, HealthServiceName, ServiceStatus (+8 more)

### Community 46 - "AppModule Wiring"
Cohesion: 0.14
Nodes (15): AppModule, Module, installNotFoundFallback(), logLevelsFor(), loadApiConfig(), loadRootEnv(), bootstrap(), validEnv (+7 more)

### Community 47 - "Password Reset Store"
Cohesion: 0.15
Nodes (8): PasswordResetStore, Inject, Injectable, Inject, Inject, RedisService, Inject, Injectable

### Community 48 - "Breadcrumbs"
Cohesion: 0.15
Nodes (16): AdminBreadcrumbs(), BreadcrumbLabelProvider(), LabelContext, Setter, useBreadcrumbLabel(), ADMIN_NAV, AdminNavItem, SEGMENT_LABELS (+8 more)

### Community 49 - "TS Base Config"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+11 more)

### Community 50 - "Stitch Certificate Registry Screen"
Cohesion: 0.14
Nodes (20): Academic Session Selector & Global Search, Arweave Decentralized Storage Node, Audit Trail (Verification Queries), Certificate Revocation / Disciplinary Annulment, Certificate Status Lifecycle (Issued, Pending Sign-off, Revoked), Credential Status KPI Cards, Degree Certificate Parchment Template, Foil & Watermark Physical Security (+12 more)

### Community 51 - "Playwright E2E Specs"
Cohesion: 0.26
Nodes (11): SERVICES, Account, capture(), E2EFixtures, expectNoHorizontalOverflow(), expectNoSeriousA11yViolations(), fixtures(), openSection() (+3 more)

### Community 52 - "Stitch Public Portal Screen"
Cohesion: 0.13
Nodes (19): Bulk Verification & Institutional Access (Enterprise Gateway), Certificate Serial Format DOC-[YEAR]-[SERIAL], Certificate Verification (Conferrals & Degrees), Certified PDF Attestation (sealed PDF with audit trail and verification token), Check Results (Transcripts & Grades), Authenticated Credentials Stats Banner (148,290+ issued, 100% official, instant), Docversity Academic Registry, FERPA & GDPR Compliance (+11 more)

### Community 53 - "CSRF Guard"
Cohesion: 0.16
Nodes (9): Inject, CsrfGuard, normalizeOrigin(), Inject, Injectable, CsrfService, Inject, Injectable (+1 more)

### Community 54 - "Web Dev Dependencies"
Cohesion: 0.11
Nodes (18): devDependencies, @axe-core/playwright, @docversity/config, @docversity/database, eslint, globals, jsdom, @playwright/test (+10 more)

### Community 55 - "Academic Session Schemas"
Cohesion: 0.12
Nodes (17): ACADEMIC_SESSION_DATE_ORDER_MESSAGE, ACADEMIC_SESSION_SORT_FIELDS, AcademicSession, AcademicSessionList, academicSessionListSchema, AcademicSessionQuery, academicSessionQuerySchema, academicSessionSchema (+9 more)

### Community 56 - "Prisma Client & Test DB"
Cohesion: 0.19
Nodes (12): checkDatabaseConnection(), createPrismaClient(), packages_database_src_index_prismaclient, LOCAL_HOSTS, prepare(), prepareTestDatabase(), PrepareTestDatabaseOptions, loadRootEnv() (+4 more)

### Community 57 - "shadcn Components Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 58 - "Stitch Result Verification Screen"
Cohesion: 0.16
Nodes (17): Institutional Academic Ledger (Folio), Academic Result Verification Detail Screen, Authenticated Transcript Header Card, Office of the Controller of Examinations, Docversity UI/UX Design System (navy/blue institutional palette, card layout), Docversity Registry Footer (Verification Services, Institutional Governance, ISO 27001, FERPA/GDPR), Institutional Verification Code (Hash), Statement of Marks & Credits Table (+9 more)

### Community 59 - "API Runtime Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @aws-sdk/client-s3, cookie, @docversity/database, @docversity/types, @docversity/validation, helmet, ioredis (+8 more)

### Community 60 - "Academic Sessions Rows & Keys"
Cohesion: 0.14
Nodes (14): CODE_CONFLICT, include, SessionRow, sessionKeys, sessionsApi, packages_validation_dist_index_academic_session_date_order_message, packages_validation_dist_index_academicsession, packages_validation_dist_index_academicsessionlist (+6 more)

### Community 61 - "Web Runtime Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @docversity/types, @docversity/ui, @docversity/validation, @hookform/resolvers, lucide-react, motion, next (+8 more)

### Community 62 - "UI Primitives & Login Form"
Cohesion: 0.23
Nodes (9): Badge(), badgeVariants, buttonVariants, Label(), Separator(), Textarea(), class-variance-authority, radix-ui (+1 more)

### Community 63 - "TS Next.js Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowJs, declaration, declarationMap, incremental, jsx, lib, module (+7 more)

### Community 64 - "Stitch Admin Dashboard Screen"
Cohesion: 0.16
Nodes (16): Academic Session Selector, Admin Registry Dashboard Screen, Docversity Registrar Core, Generate Certificate Action, Global Search (Matric ID / Diploma Hash), Import Excel Action, KPI Stat Cards, Recent Certificates Panel (+8 more)

### Community 65 - "JSON Logger"
Cohesion: 0.22
Nodes (4): JsonLogger, LogSink, redact(), REDACTED

### Community 66 - "Student Detail View"
Cohesion: 0.22
Nodes (12): useSetBreadcrumbLabel(), initials(), useStudent(), useStudentActivity(), ActivityTab(), Header(), StudentDetailView(), Tabs() (+4 more)

### Community 67 - "API Docs"
Cohesion: 0.16
Nodes (15): Academic Masters API (Phase 4), No-deletes rule (deactivate via status), Server-side relation resolution rules, API Documentation, /api/v1 business endpoint prefix, Standard error envelope (code, message, requestId), Swagger / OpenAPI (generated), Zod schemas as single source of truth for OpenAPI (+7 more)

### Community 68 - "Prisma Client & Seed Fixtures"
Cohesion: 0.16
Nodes (12): CreatePrismaClientOptions, packages_database_src_generated_prisma_client, packages_database_src_generated_prisma_client_prismaclient, DEV_FIXTURE_LABEL, PROGRAMS, SeedSummary, STUDENTS, SUBJECTS (+4 more)

### Community 69 - "Stitch Excel Import Screen"
Cohesion: 0.20
Nodes (15): Academic Rules Enforcement, Academic Session Selector & Global Search, Atomic Transaction Import with Rollback, Validation Error Log CSV Export, Row-level Error Review Table with Suggested Actions, Six-Step Import Wizard Stepper, SHA256 Data Ingestion Checksum / Cryptographic Roster Commitment, Detected Intelligent Column Mapping (Docversity Semantic Engine) (+7 more)

### Community 70 - "CI & Docker Compose"
Cohesion: 0.20
Nodes (14): CI Workflow, Playwright browser smoke test, Database schema drift check (pnpm db:check), CI verify job (install, lint, typecheck, test, build, e2e), Docker Compose (local infra), Loopback-only non-default host ports, MinIO service (Chainguard image), PostgreSQL 17 service (+6 more)

### Community 71 - "Next Config & Web Env"
Cohesion: 0.18
Nodes (11): nextConfig, rootEnvFile, securityHeaders, loadWebEnv(), WebEnv, webEnvSchema, config, proxy() (+3 more)

### Community 72 - "Web Unit Tests"
Cohesion: 0.26
Nodes (10): SessionProvider(), department, EMPTY_PAGE, mockFetch(), REGISTRAR, renderWithProviders(), VIEWER, @testing-library/jest-dom (+2 more)

### Community 73 - "API Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @docversity/config, eslint, @nestjs/cli, @nestjs/testing, supertest, @swc/core, @types/express (+5 more)

### Community 74 - "Dev Status Page"
Cohesion: 0.22
Nodes (8): apiDetail(), DevelopmentStatusPage(), metadata, SERVICE_LABELS, ApiHealthResult, getApiHealth(), healthy, packages_validation_dist_index_healthresponse

### Community 75 - "Validation Barrel Exports"
Cohesion: 0.15
Nodes (12): departmentQuerySchema, updateDepartmentSchema, createProgramSchema, createStudentSchema, normalizeRegistrationNumber(), packages_validation_src_index_createacademicsessionschema, packages_validation_src_index_createprogramschema, packages_validation_src_index_createstudentschema (+4 more)

### Community 76 - "Stitch Design System"
Cohesion: 0.29
Nodes (13): Google Stitch export — visual reference only, Unsupported design claims (ISO 27001, FERPA/GDPR, blockchain, Arweave, HSM, PKI), Academic Result Verification Detail screen, Academic Trust Matrix design system, 8-point baseline 12/8/4-column responsive grid, Typography: Plus Jakarta Sans headlines, Inter body, tabular numerics, Registrar Core admin sidebar navigation, Admin Registry Dashboard screen (+5 more)

### Community 77 - "Worker Build Config"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, erasableSyntaxOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+3 more)

### Community 78 - "Admin Login & Server Auth"
Cohesion: 0.25
Nodes (8): AdminLoginPage(), metadata, ProtectedAdminLayout(), getSessionState(), SESSION_COOKIES, SessionState, packages_validation_dist_index_authuser, packages_validation_dist_index_authuserschema

### Community 79 - "Architecture Overview"
Cohesion: 0.25
Nodes (11): Student photo upload deferred, Architecture Overview, ADR-0002 Separate API, ADR-0003 Background worker, ADR-0004 Object storage, ADR-0005 Toolchain baseline, API enqueues heavy jobs to worker via Redis, Browser talks to Next.js only (+3 more)

### Community 80 - "Product Decisions"
Cohesion: 0.24
Nodes (11): Excel import architecture (upload → map → validate → commit), TECHNICAL-AUDIT.md (legacy WordPress audit), Product Decisions Already Agreed, Historic QR compatibility (legacy verify.thedocversity.com URLs), Legacy WordPress verification system, One authoritative certificate record, Agreed public/admin routing reference, Single import subsystem /admin/imports (STUDENT + RESULT) (+3 more)

### Community 81 - "Repo README Topology"
Cohesion: 0.27
Nodes (11): Runtime topology (browser → web → api → Redis/worker), DOCVERSITY README, apps/api (NestJS REST API), apps/web (Next.js), apps/worker (BullMQ worker), packages/database (Prisma), packages/types, Phase 4 status: design system, shells, academic records (+3 more)

### Community 82 - "ADR-0008 Admin Frontend"
Cohesion: 0.18
Nodes (11): ADR-0008: Admin frontend data and component approach, Framer Motion (motion/react) only, Shared Zod schemas for React Hook Form and API, TanStack Table v8 (8.21.3), List state in URL (useListParams), cn() utility (clsx + tailwind-merge), @docversity/ui design system (Tailwind v4 tokens + shadcn/ui), StatusBadge component (+3 more)

### Community 83 - "Database Error Mapping"
Cohesion: 0.29
Nodes (9): DOMAIN_GUARD_SQLSTATE, domainGuardName(), DriverCause, isDomainIntegrityViolation(), prismaErrorCode(), uniqueConstraintName(), packages_database_src_generated_prisma_client_prisma, packages_database_src_generated_prisma_models (+1 more)

### Community 84 - "Stitch QR Scanner Screen"
Cohesion: 0.24
Nodes (11): Decentralized Cryptographic Registrar, Docversity Registry Footer, ECC-200 Cryptogram, FERPA / GDPR Clean Verification, Immutable Timestamp, Institutional Trust Visual Language, Live Optical Scan Aperture, Manual Cryptographic Token Resolution (Verify by Serial) (+3 more)

### Community 85 - "Audit & Prisma Services"
Cohesion: 0.24
Nodes (5): AuditService, Injectable, PrismaService, Inject, Injectable

### Community 86 - "API Build Config"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, extends, include (+1 more)

### Community 87 - "Animation Rules & Migration Plan"
Cohesion: 0.31
Nodes (10): Frontend Animation Rules, Framer Motion (default UI motion), GSAP (timeline-heavy special effects only), No animation in admin data views / verification results, Respect prefers-reduced-motion, Initial Stitch Migration Plan (archived), grading module (pure calculation engine), Planned NestJS backend module architecture (+2 more)

### Community 88 - "Monorepo & Toolchain ADRs"
Cohesion: 0.27
Nodes (10): ADR-0001: pnpm workspaces + Turborepo monorepo, minimumReleaseAge supply-chain gate, pnpm workspaces, Turborepo task graph, ADR-0005: Toolchain baseline and version pins, allowBuilds install-script allow-list, Native ESM everywhere, Version pins (TS 6.0.3, Next 16.3.8, Prisma 7.10.0, ESLint 9.39.5, NestJS 12, Zod 4.6.5) (+2 more)

### Community 89 - "TS NestJS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, emitDecoratorMetadata, experimentalDecorators, strictPropertyInitialization, verbatimModuleSyntax, display, extends, $schema (+1 more)

### Community 90 - "Nest CLI Config"
Cohesion: 0.22
Nodes (8): collection, compilerOptions, builder, deleteOutDir, tsConfigPath, entryFile, $schema, sourceRoot

### Community 91 - "API Scripts"
Cohesion: 0.22
Nodes (9): scripts, admin:create, build, clean, dev, lint, start, test (+1 more)

### Community 92 - "Web Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, clean, dev, lint, start, test, test:e2e (+1 more)

### Community 93 - "Root Layout & Fonts"
Cohesion: 0.25
Nodes (6): inter, jakarta, metadata, viewport, apps_web_src_styles_globals, Toaster()

### Community 94 - "Worker TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 95 - "TS Node Config"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, types, display, extends, ./base.json, $schema

### Community 96 - "Documents Build Config"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 97 - "Types Build Config"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 98 - "Validation Build Config"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, @docversity/config/typescript/node.json

### Community 99 - "Legacy Login API Client"
Cohesion: 0.39
Nodes (7): LoginForm(), onSubmit(), textField(), ApiErrorBody, errorMessage(), fetchCsrfToken(), postJson()

### Community 100 - "Web TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, rootDir, exclude, extends, include, @docversity/config/typescript/nextjs.json

### Community 101 - "Authorization Guards Doc"
Cohesion: 0.46
Nodes (8): Authorization, AuthGuard (global), CsrfGuard (global), Maker–checker separation, Code-defined permissions (packages/types permissions.ts), PermissionsGuard (@RequirePermissions), ROLE_PERMISSIONS map, Roles (SUPER_ADMIN, REGISTRAR, EXAM_ADMIN, CERTIFICATE_ADMIN, APPROVER, VIEWER)

### Community 102 - "API & Storage ADRs"
Cohesion: 0.29
Nodes (8): ADR-0002: Separate NestJS API instead of Next.js server logic, NestJS REST API (apps/api), Next.js as UI only (no direct DB/Redis/storage access), ADR-0004: S3-compatible object storage (MinIO local, R2/S3 prod), Chainguard MinIO image (pinned by digest), ObjectStorage port / S3ObjectStorage, Private buckets with short-lived presigned URLs, Client-side fetching with TanStack Query via /api/v1 proxy

### Community 103 - "Database Build Config"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, outDir, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 104 - "API TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/nestjs.json

### Community 105 - "Public Home Page"
Cohesion: 0.33
Nodes (4): metadata, SERVICES, FadeIn(), motion

### Community 106 - "Worker ADR & Shared Packages"
Cohesion: 0.38
Nodes (7): ADR-0003: Long-running work runs in a BullMQ worker, BullMQ worker on Redis (apps/worker), health-test job on system queue, Idempotent at-least-once jobs, @docversity/types shared types and constants (queue names), @docversity/validation Zod schemas, Phase 1 infrastructure schemas (env, GET /health, health-test job)

### Community 107 - "Database TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 108 - "Documents TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 109 - "Types TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 110 - "Validation TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, @docversity/config/typescript/node.json

### Community 111 - "Documents Rendering Rules"
Cohesion: 0.33
Nodes (6): Totals/GPAs derived from stored data, never typed, @docversity/documents official document layouts, QR codes encode only an opaque verification URL, render(layoutKey, data) -> HTML string, Same HTML for preview and PDF; PDF rendering only in worker, Template = code-defined layout + DB configuration

### Community 112 - "UI TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, plugins, extends, include, @docversity/config/typescript/nextjs.json

### Community 113 - "DB Integrity ADR"
Cohesion: 0.60
Nodes (5): ADR-0006: Academic integrity rules enforced by PostgreSQL, Database-enforced integrity (CHECK constraints, triggers, partial unique indexes), Immutability of PUBLISHED results / ISSUED certificates; append-only audit logs, Prisma partialIndexes preview feature, SQLSTATE DV001 guard errors

### Community 114 - "Session Auth ADR"
Cohesion: 0.60
Nodes (5): ADR-0007: Server-side Redis sessions with HTTP-only cookies, Argon2id password hashing, CSRF token (session HMAC) + Origin check global guard, Rejection of browser-stored JWTs, Opaque session ID in __Host- HttpOnly cookie, state in Redis

### Community 115 - "Prettier Config"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

### Community 116 - "Config Package Docs"
Cohesion: 0.67
Nodes (3): @docversity/config shared tooling configuration, Shared ESLint configs (base/node/nextjs) + Prettier formatting, Shared TypeScript configs (base/node/nestjs/nextjs)

## Ambiguous Edges - Review These
- `Six-Step Import Wizard Stepper` → `Registry Pipeline v2.4`  [AMBIGUOUS]
  references/stitch/stitch_docversity_ui_ux_design_system/excel_bulk_import_validation/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **875 isolated node(s):** `singleQuote`, `trailingComma`, `printWidth`, `$schema`, `collection` (+870 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1108 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Six-Step Import Wizard Stepper` and `Registry Pipeline v2.4`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `bullmq` connect `BullMQ Worker Runtime` to `Worker Package Manifest`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `@nestjs/common` connect `Audit Module & Dashboard` to `API Auth Decorators & Module`, `API Package Manifest`, `Academic Controllers (OpenAPI)`, `Programs Service`, `Auth Client Info & Errors`, `JSON Logger`, `Departments Service`, `Health Checks & Timeouts`, `API Academic & Audit Tests`, `Password Reset Notifier`, `OpenAPI List Query Plumbing`, `AppModule Wiring`, `API Bootstrap & Swagger`, `Audit Activity Summaries`, `Academic Sessions Rows & Keys`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `next` connect `Public Info Pages` to `Admin Route Pages`, `Student Detail View`, `Admin Data Table Components`, `Next Config & Web Env`, `Public Home Page`, `Dev Status Page`, `Admin & Public Shells`, `Admin Login & Server Auth`, `Breadcrumbs`, `Web Package Manifest`, `Dashboard & Student Pages`, `Root Layout & Fonts`, `UI Primitives & Login Form`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `singleQuote`, `trailingComma`, `printWidth` to the rest of the system?**
  _875 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Route Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.06468797564687975 - nodes in this community are weakly interconnected._
- **Should `API Auth Decorators & Module` be split into smaller, more focused modules?**
  _Cohesion score 0.06479113384484228 - nodes in this community are weakly interconnected._