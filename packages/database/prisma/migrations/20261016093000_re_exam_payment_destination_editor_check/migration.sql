-- Phase 9C review hardening: maker–checker also excludes the person who last changed a draft.
-- 20261016090000_re_exam_payments only required approver <> creator, so a second person could edit a
-- colleague's draft (beneficiary, amounts, QR) and approve their own change. Every draft edit and QR
-- upload sets updated_by_user_id, and approved rows are frozen, so this is checked on APPROVED rows.
-- Additive: no existing row changes (an approved row violating it would make this migration fail).
ALTER TABLE "re_exam_payment_destinations"
  ADD CONSTRAINT "re_exam_payment_destinations_approver_not_editor_check"
  CHECK (status <> 'APPROVED' OR approved_by_user_id <> updated_by_user_id);
