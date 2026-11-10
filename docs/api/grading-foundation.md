# Synthetic grading evaluator

Pure technical foundation in `packages/validation/src/results/grading.ts`. No route, database write,
grading-scheme activation, result publication or student/public disclosure is added. Existing result
review and student-results contracts stay unchanged. This is not an approved university policy.

`evaluateSyntheticGrades(policy, input)` validates a complete versioned policy and one explicitly
selected attempt per subject. `evaluateSyntheticTranscript(policy, { periods })` evaluates selected
periods of one registration against that same explicit policy snapshot. CGPA is credit-weighted from
unrounded subject points, not an average of rounded SGPAs. Missing/unsupported rules are refused.
No hidden selection of re-exam attempts or increment of an application attempt number occurs.

The v1 policy must explicitly supply SYNTHETIC_ONLY usage, identity/version, descending grade bands,
component minima and their failing grade, GPA denominator, HALF_UP/TRUNCATE rounding and FAIL/BACKLOG
outcome. Supported v1 modes are SUM_COMPONENTS, EXPLICIT attempt selection, WITHHOLD on absence and
PASS_ONLY earned credits. These are declared technical modes, not inferred university rules. No
defaults or official-policy flag exists. Official usage is rejected; results always carry
`officialPublicationAllowed: false` and a detached policy snapshot.

Inputs use decimal strings: marks/maxima to two decimals, credits to two and grade points to three.
Arithmetic uses scaled integers. Grade boundaries compare exact ratios before rounding; GPA rounds
only once to three decimals. Null marks for present attempts, marks for absent attempts, zero maxima,
marks exceeding maxima, duplicate subjects/components/periods, mixed-registration transcripts,
unknown fields and values exceeding storage precision are refused. Absence withholds GPA; a zero
credit denominator returns null. Arrays and scalar lengths are bounded.

The evaluator package itself has no persistence. The application integration below stores only a
synthetic calculation snapshot inside the existing result-review transaction. No schema/migration,
seed, template, permission or UI changed. Official policy provenance and publication authority remain
unimplemented; user-supplied policy JSON is never authorization.

Remaining boundaries: approved official grading/absence/attempt-selection rules, mixed-policy
transcript semantics, retotaling rules, publication roles/provenance and release/withdrawal workflows.
Those operations remain unavailable. Tests use an invented SAMPLE_GRADING policy only.

Local checkpoint, 10 November 2026: the complete validation package passed **93 tests in 12 files**
(including 23 new grading cases), typecheck and affected-file lint, exit 0; bounded runner elapsed
28.911 seconds. Execution used cached tools in a disposable no-network container, one CPU, 512 MiB
memory, 256 MiB Node heap and bounded scratch, without builds or data services. This branch remains
uncommitted. Full repository integration, browser verification, Graphify refresh and review are still
required before delivery; these results are separate from Phase 15A's security evidence.

In the integration candidate, `ResultReviewService` invokes this evaluator during SUBMIT only when
an explicitly injected synthetic policy is present and NODE_ENV is test. Inputs come from the locked
result, its exact attempt and assigned curriculum components/credits; no request supplies grades or
policy. The calculation and input-snapshot digest persist in `Result.calculationSnapshot` in the same
transaction as the immutable review event and audit. Official outcome/GPA columns and publication
remain untouched. The default policy definition is null in every environment. Application-level
authorization, replay, invalid-policy and audit-rollback tests have been added; their execution is
tracked separately from the package-only totals above.

Application verification: the integrated grading/payment checkpoint passed 1,020 unit/integration
tests and 78 browser tests, exit 0. The result-review selection includes synthetic calculation,
authorization, replay, invalid-policy and audit-rollback cases. Later certificate additions have
separate targeted evidence and are not covered by that earlier full run.
