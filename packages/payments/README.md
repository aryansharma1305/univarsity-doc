# Synthetic payment foundation

Server-only provider-neutral order/refund/reconciliation interface and a **test-only in-memory mock**.
No application dependency, API route, database migration, existing manual payment update, checkout
button, gateway network call or live credential is added. Construction refuses NODE_ENV other than
test. Synthetic receipts are not university receipts or proof of real payment.

The mock binds raw-body HMAC signatures and timestamps, validates strict event shapes and matches
reference/currency/minor amount against its stored order. Request/event/refund keys are idempotent;
reuse with different content is refused. Terminal conflicts require reconciliation rather than
silently downgrading state. Concurrent duplicate and over-refund tests exercise synchronous in-memory
state transitions; returned objects are detached copies.

The mock signature protocol is invented for synthetic tests, not a gateway specification. Its
three-letter currency strings and integer amounts make no currency exponent or university fee claim.
The port is sandbox-only. A real provider needs a separately reviewed contract and durable atomic
order/event/refund receipts; in-memory maps are not cross-process or restart-safe transaction handling.
No claim of persistent financial idempotency is made.

Remaining integration: approved provider/currency rules and sandbox credentials, persistent
transaction receipts with unique constraints, webhook
deployment/rate limits, retry/reconciliation jobs, refund authorization/auditing and official receipt
policy. Existing re-exam manual finance review remains authoritative and unchanged.

Local checkpoint, 10 November 2026: **15 tests**, package typecheck and lint passed, exit 0, bounded
runner elapsed 11.845 seconds. Cached tools only, disposable no-network container, one CPU, 512 MiB
memory and bounded scratch; no builds, DB/storage services or gateway calls. The branch remains
uncommitted. Frozen-lock installation, full repository integration, Graphify refresh and review are
pending. This does not certify a real gateway or persistent payment integration.

The integration candidate connects the adapter to `ReExamPaymentsService` through internal test-only
methods. Owned obligations supply the reference/amount/currency; signed callbacks can submit the
existing obligation for Finance review, never verify it or approve the academic application. Audit
metadata marks the source SYNTHETIC_SANDBOX. Duplicate callbacks reuse the stored submission and
audit-failure retries are covered by new integration cases. Default provider is null; no checkout or
public webhook route, runtime activation flag or new financial permission is added.

Gateway orders/event state are still process-local to the mock. Durable gateway receipts and restart
recovery remain implementation work; a persisted manual submission alone does not prove those
capabilities. The new application integration tests are not included in the earlier package totals.

Application verification: re-exam payment and result-review integration selections passed within
the 1,020-test/78-browser checkpoint, exit 0. The payment file has 13 cases, including three mock
lifecycle cases. These counts overlap the complete suite; they are not additional unique tests.
