-- CreateTable
CREATE TABLE "synthetic_releases" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "registration_id" UUID NOT NULL,
    "result_id" UUID,
    "approval_event_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "usage" VARCHAR(24) NOT NULL DEFAULT 'SYNTHETIC_ONLY',
    "snapshot" JSONB NOT NULL,
    "source_digest" CHAR(64) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "prepared_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "published_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "synthetic_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retotaling_requests" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "submission_key" UUID NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retotaling_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_gateway_orders" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'CREATED',
    "refunded_minor" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sandbox_gateway_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_gateway_receipts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_gateway_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_migration_batches" (
    "id" UUID NOT NULL,
    "source_digest" CHAR(64) NOT NULL,
    "plan_digest" CHAR(64) NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'DRY_RUN',
    "checkpoint" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legacy_migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retotaling_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "message" VARCHAR(1000),
    "actor_user_id" UUID,
    "actor_account_id" UUID,
    "request_digest" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retotaling_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synthetic_releases_registration_id_kind_status_idx" ON "synthetic_releases"("registration_id", "kind", "status");

-- CreateIndex
CREATE INDEX "retotaling_requests_release_id_status_idx" ON "retotaling_requests"("release_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retotaling_requests_registration_id_submission_key_key" ON "retotaling_requests"("registration_id", "submission_key");

-- CreateIndex
CREATE INDEX "sandbox_gateway_orders_payment_id_idx" ON "sandbox_gateway_orders"("payment_id");

-- CreateIndex
CREATE INDEX "sandbox_gateway_receipts_order_id_created_at_idx" ON "sandbox_gateway_receipts"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "retotaling_events_request_id_version_key" ON "retotaling_events"("request_id", "version");

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_approval_event_id_fkey" FOREIGN KEY ("approval_event_id") REFERENCES "result_review_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synthetic_releases" ADD CONSTRAINT "synthetic_releases_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retotaling_requests" ADD CONSTRAINT "retotaling_requests_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retotaling_requests" ADD CONSTRAINT "retotaling_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "synthetic_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_gateway_orders" ADD CONSTRAINT "sandbox_gateway_orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "re_exam_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_gateway_receipts" ADD CONSTRAINT "sandbox_gateway_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sandbox_gateway_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_migration_batches" ADD CONSTRAINT "legacy_migration_batches_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retotaling_events" ADD CONSTRAINT "retotaling_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "retotaling_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retotaling_events" ADD CONSTRAINT "retotaling_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retotaling_events" ADD CONSTRAINT "retotaling_events_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additive synthetic infrastructure only; existing publication/issuance guards are unchanged.
ALTER TABLE synthetic_releases ADD CONSTRAINT synthetic_release_shape CHECK (
 usage='SYNTHETIC_ONLY' AND kind IN ('RESULT','REGISTRATION','ADMISSION_LETTER')
 AND status IN ('DRAFT','APPROVED','PUBLISHED','WITHDRAWN') AND version>0
 AND source_digest ~ '^[a-f0-9]{64}$' AND request_digest ~ '^[a-f0-9]{64}$'
 AND (kind='RESULT')=(result_id IS NOT NULL AND approval_event_id IS NOT NULL)
 AND (kind='RESULT' OR (result_id IS NULL AND approval_event_id IS NULL))
 AND snapshot->>'usage'='SYNTHETIC_ONLY' AND snapshot->>'registrationId'=registration_id::text
 AND (status NOT IN ('APPROVED','PUBLISHED','WITHDRAWN') OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_id<>prepared_by_id))
 AND (status NOT IN ('PUBLISHED','WITHDRAWN') OR (published_by_id IS NOT NULL AND published_at IS NOT NULL AND published_by_id<>prepared_by_id))
);
CREATE FUNCTION docversity_synthetic_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD; e RECORD;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'synthetic release history is immutable' USING ERRCODE='DV001'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.version<>1 OR NEW.approved_by_id IS NOT NULL OR NEW.published_by_id IS NOT NULL THEN RAISE EXCEPTION 'prepare a synthetic release first' USING ERRCODE='DV001'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','version','approved_by_id','approved_at','published_by_id','published_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','approved_by_id','approved_at','published_by_id','published_at','updated_at']) OR NEW.version<>OLD.version+1 OR NOT ((OLD.status='DRAFT' AND NEW.status='APPROVED') OR (OLD.status='APPROVED' AND NEW.status='PUBLISHED') OR (OLD.status='PUBLISHED' AND NEW.status='WITHDRAWN')) THEN RAISE EXCEPTION 'invalid synthetic release transition or snapshot edit' USING ERRCODE='DV001'; END IF;
  IF OLD.approved_by_id IS NOT NULL AND (NEW.approved_by_id,NEW.approved_at) IS DISTINCT FROM (OLD.approved_by_id,OLD.approved_at) THEN RAISE EXCEPTION 'approval receipt is frozen' USING ERRCODE='DV001'; END IF;
  IF OLD.published_by_id IS NOT NULL AND (NEW.published_by_id,NEW.published_at) IS DISTINCT FROM (OLD.published_by_id,OLD.published_at) THEN RAISE EXCEPTION 'publication receipt is frozen' USING ERRCODE='DV001'; END IF;
 END IF;
 IF NEW.kind='RESULT' AND NEW.status<>'WITHDRAWN' THEN
  SELECT * INTO r FROM results WHERE id=NEW.result_id FOR SHARE;
  SELECT * INTO e FROM result_review_events WHERE id=NEW.approval_event_id;
  IF r.id IS NULL OR r.student_registration_id<>NEW.registration_id OR r.publication_status<>'APPROVED' OR e.result_id<>r.id OR e.action<>'APPROVE' OR e.to_status<>'APPROVED' OR e.result_version<>r.version OR (NEW.snapshot->>'version')::int<>r.version OR r.calculation_snapshot->>'usage'<>'SYNTHETIC_ONLY' OR NEW.snapshot->>'resultId'<>r.id::text OR NOT EXISTS(SELECT 1 FROM result_review_events s WHERE s.result_id=r.id AND s.action='SUBMIT' AND s.result_version=(r.calculation_snapshot->>'resultVersion')::int AND s.snapshot=e.snapshot) THEN RAISE EXCEPTION 'approved synthetic result provenance required' USING ERRCODE='DV001'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER synthetic_release_guard BEFORE INSERT OR UPDATE OR DELETE ON synthetic_releases FOR EACH ROW EXECUTE FUNCTION docversity_synthetic_release_guard();
CREATE FUNCTION docversity_synthetic_published_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM synthetic_releases WHERE result_id=OLD.id AND status='PUBLISHED') THEN RAISE EXCEPTION 'withdraw the synthetic release before changing its source result' USING ERRCODE='DV001'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER synthetic_published_result_guard BEFORE UPDATE OR DELETE ON results FOR EACH ROW EXECUTE FUNCTION docversity_synthetic_published_result_guard();

ALTER TABLE retotaling_requests ADD CONSTRAINT retotaling_request_shape CHECK(version>0 AND btrim(reason)<>'' AND status IN ('SUBMITTED','INFORMATION_REQUESTED','INFORMATION_PROVIDED','CANCELLED','CLOSED'));
ALTER TABLE retotaling_events ADD CONSTRAINT retotaling_event_shape CHECK(version>0 AND (actor_user_id IS NULL)<>(actor_account_id IS NULL) AND status IN ('SUBMITTED','INFORMATION_REQUESTED','INFORMATION_PROVIDED','CANCELLED','CLOSED') AND action IN ('SUBMIT','REQUEST_INFORMATION','RESPOND','CANCEL','CLOSE'));
CREATE FUNCTION docversity_retotaling_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retotaling history is preserved' USING ERRCODE='DV001'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'SUBMITTED' OR NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM synthetic_releases WHERE id=NEW.release_id AND registration_id=NEW.registration_id AND kind='RESULT' AND status='PUBLISHED') THEN RAISE EXCEPTION 'an owned published release is required' USING ERRCODE='DV001'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at']) OR NEW.version<>OLD.version+1 OR NOT ((OLD.status IN ('SUBMITTED','INFORMATION_PROVIDED') AND NEW.status='INFORMATION_REQUESTED') OR (OLD.status='INFORMATION_REQUESTED' AND NEW.status='INFORMATION_PROVIDED') OR (OLD.status NOT IN ('CANCELLED','CLOSED') AND NEW.status IN ('CANCELLED','CLOSED'))) THEN RAISE EXCEPTION 'invalid clerical request transition' USING ERRCODE='DV001'; END IF;
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER retotaling_guard BEFORE INSERT OR UPDATE OR DELETE ON retotaling_requests FOR EACH ROW EXECUTE FUNCTION docversity_retotaling_guard();
CREATE FUNCTION docversity_retotaling_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'retotaling events are append only' USING ERRCODE='DV001'; END IF;
 SELECT * INTO r FROM retotaling_requests WHERE id=NEW.request_id FOR UPDATE;
 IF r.id IS NULL OR NEW.version<>r.version OR NEW.status<>r.status THEN RAISE EXCEPTION 'matching request version required' USING ERRCODE='DV001'; END IF;
 IF NEW.actor_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_accounts a JOIN student_registrations s ON s.student_id=a.student_id WHERE a.id=NEW.actor_account_id AND s.id=r.registration_id AND a.status='ACTIVE') THEN RAISE EXCEPTION 'request owner required' USING ERRCODE='DV001'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER retotaling_event_guard BEFORE INSERT OR UPDATE OR DELETE ON retotaling_events FOR EACH ROW EXECUTE FUNCTION docversity_retotaling_event_guard();
CREATE FUNCTION docversity_retotaling_committed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM retotaling_events WHERE request_id=NEW.id AND version=NEW.version AND status=NEW.status) THEN RAISE EXCEPTION 'retotaling event required in the same transaction' USING ERRCODE='DV001'; END IF; RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER retotaling_committed AFTER INSERT OR UPDATE ON retotaling_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION docversity_retotaling_committed();

ALTER TABLE sandbox_gateway_orders ADD CONSTRAINT sandbox_order_shape CHECK(amount_minor>0 AND currency ~ '^[A-Z]{3}$' AND refunded_minor>=0 AND refunded_minor<=amount_minor AND status IN ('CREATED','PAID','FAILED','PARTIALLY_REFUNDED','REFUNDED') AND (status NOT IN ('CREATED','PAID','FAILED') OR refunded_minor=0) AND (status<>'PARTIALLY_REFUNDED' OR (refunded_minor>0 AND refunded_minor<amount_minor)) AND (status<>'REFUNDED' OR refunded_minor=amount_minor));
ALTER TABLE sandbox_gateway_receipts ADD CONSTRAINT sandbox_receipt_shape CHECK(kind IN ('PAYMENT','FAILURE','REFUND') AND amount_minor>=0 AND (kind='FAILURE' OR amount_minor>0));
CREATE FUNCTION docversity_sandbox_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'sandbox order history is preserved' USING ERRCODE='DV001'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'CREATED' OR NEW.refunded_minor<>0 OR NOT EXISTS(SELECT 1 FROM re_exam_payments p WHERE p.id=NEW.payment_id AND p.amount_minor=NEW.amount_minor AND p.currency=NEW.currency AND p.status='AWAITING_PAYMENT') THEN RAISE EXCEPTION 'server owned obligation required' USING ERRCODE='DV001'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','refunded_minor','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','refunded_minor','updated_at']) OR NOT ((OLD.status='CREATED' AND NEW.status IN ('PAID','FAILED')) OR (OLD.status IN ('PAID','PARTIALLY_REFUNDED') AND NEW.status IN ('PARTIALLY_REFUNDED','REFUNDED') AND NEW.refunded_minor>OLD.refunded_minor)) THEN RAISE EXCEPTION 'invalid sandbox order transition' USING ERRCODE='DV001'; END IF;
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER sandbox_order_guard BEFORE INSERT OR UPDATE OR DELETE ON sandbox_gateway_orders FOR EACH ROW EXECUTE FUNCTION docversity_sandbox_order_guard();
CREATE FUNCTION docversity_sandbox_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'sandbox receipts are append only' USING ERRCODE='DV001'; END IF;
 PERFORM id FROM sandbox_gateway_orders WHERE id=NEW.order_id FOR UPDATE;
 IF NEW.kind IN ('PAYMENT','FAILURE') AND EXISTS(SELECT 1 FROM sandbox_gateway_receipts WHERE order_id=NEW.order_id AND kind IN ('PAYMENT','FAILURE')) THEN RAISE EXCEPTION 'one terminal callback per order' USING ERRCODE='DV001'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER sandbox_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON sandbox_gateway_receipts FOR EACH ROW EXECUTE FUNCTION docversity_sandbox_receipt_guard();
CREATE FUNCTION docversity_sandbox_ledger_committed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE paid bigint; refunds bigint; failures bigint;
BEGIN
 SELECT count(*) FILTER(WHERE kind='PAYMENT'),coalesce(sum(amount_minor) FILTER(WHERE kind='REFUND'),0),count(*) FILTER(WHERE kind='FAILURE') INTO paid,refunds,failures FROM sandbox_gateway_receipts WHERE order_id=NEW.id;
 IF refunds<>NEW.refunded_minor OR (NEW.status='CREATED' AND (paid<>0 OR failures<>0)) OR (NEW.status='FAILED' AND (failures<>1 OR paid<>0)) OR (NEW.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND (paid<>1 OR failures<>0 OR NOT EXISTS(SELECT 1 FROM sandbox_gateway_receipts WHERE order_id=NEW.id AND kind='PAYMENT' AND amount_minor=NEW.amount_minor))) THEN RAISE EXCEPTION 'matching durable sandbox receipts required' USING ERRCODE='DV001'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER sandbox_ledger_committed AFTER INSERT OR UPDATE ON sandbox_gateway_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION docversity_sandbox_ledger_committed();

ALTER TABLE legacy_migration_batches ADD CONSTRAINT legacy_batch_shape CHECK(checkpoint>=0 AND checkpoint<=1000 AND state IN ('DRY_RUN','RECONCILED','QUARANTINED') AND report->>'usage'='SYNTHETIC_ONLY' AND report->>'dryRun'='true' AND report->>'importAllowed'='false');
CREATE FUNCTION docversity_legacy_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'dry run history is preserved' USING ERRCODE='DV001'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['checkpoint','state','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkpoint','state','updated_at']) OR OLD.state<>'DRY_RUN' OR NEW.checkpoint<OLD.checkpoint OR NEW.checkpoint>OLD.checkpoint+100) THEN RAISE EXCEPTION 'immutable plan and monotonic recovery checkpoint required' USING ERRCODE='DV001'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER legacy_batch_guard BEFORE INSERT OR UPDATE OR DELETE ON legacy_migration_batches FOR EACH ROW EXECUTE FUNCTION docversity_legacy_batch_guard();

CREATE INDEX "synthetic_releases_result_id_status_idx" ON "synthetic_releases"("result_id","status");
ALTER TABLE synthetic_releases ADD CONSTRAINT synthetic_snapshot_identity CHECK(snapshot @> jsonb_build_object('usage','SYNTHETIC_ONLY','registrationId',registration_id::text,'kind',kind) AND (kind<>'RESULT' OR (snapshot ?& ARRAY['resultId','version','subjects'] AND snapshot->>'resultId'=result_id::text)));
ALTER TABLE retotaling_events ADD CONSTRAINT retotaling_event_actor CHECK((action IN ('SUBMIT','RESPOND','CANCEL'))=(actor_account_id IS NOT NULL));
ALTER TABLE sandbox_gateway_receipts ADD CONSTRAINT sandbox_failure_amount CHECK((kind='FAILURE')=(amount_minor=0));
CREATE FUNCTION docversity_sandbox_receipt_committed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o RECORD; paid bigint; refunds bigint; failures bigint;
BEGIN
 SELECT * INTO o FROM sandbox_gateway_orders WHERE id=NEW.order_id;
 SELECT count(*) FILTER(WHERE kind='PAYMENT'),coalesce(sum(amount_minor) FILTER(WHERE kind='REFUND'),0),count(*) FILTER(WHERE kind='FAILURE') INTO paid,refunds,failures FROM sandbox_gateway_receipts WHERE order_id=o.id;
 IF o.id IS NULL OR refunds<>o.refunded_minor OR (o.status='CREATED' AND (paid<>0 OR failures<>0)) OR (o.status='FAILED' AND (failures<>1 OR paid<>0)) OR (o.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND (paid<>1 OR failures<>0 OR NOT EXISTS(SELECT 1 FROM sandbox_gateway_receipts WHERE order_id=o.id AND kind='PAYMENT' AND amount_minor=o.amount_minor))) THEN RAISE EXCEPTION 'matching durable order state required' USING ERRCODE='DV001'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER sandbox_receipt_committed AFTER INSERT ON sandbox_gateway_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION docversity_sandbox_receipt_committed();
