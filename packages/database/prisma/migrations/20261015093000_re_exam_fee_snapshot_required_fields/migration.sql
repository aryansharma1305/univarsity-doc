-- A PostgreSQL CHECK accepts NULL, so comparisons alone do not require nullable snapshot fields.
-- Keep the applied 9B migration unchanged and explicitly require the assessed monetary values.
ALTER TABLE "re_exam_applications"
  ADD CONSTRAINT "re_exam_applications_assessed_values_required_check"
  CHECK (fee_status <> 'ASSESSED' OR (fee_currency IS NOT NULL AND fee_amount_minor IS NOT NULL));
