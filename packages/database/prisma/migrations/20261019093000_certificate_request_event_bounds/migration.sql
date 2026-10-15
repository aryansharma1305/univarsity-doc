-- Pair each append-only event with its actual application state; no approval/issuance events.
ALTER TABLE certificate_request_events ADD CONSTRAINT certificate_event_state_check CHECK (
 (action='SUBMIT' AND version=1 AND status='SUBMITTED') OR
 (action='REQUEST_INFORMATION' AND version>1 AND status='INFORMATION_REQUESTED') OR
 (action='RECORD_REVIEW' AND version>1 AND status='UNDER_REVIEW') OR
 (action='COMPLETE_REVIEW' AND version>1 AND status='REVIEW_COMPLETED') OR
 (action='RESPOND' AND version>1 AND status='INFORMATION_PROVIDED') OR
 (action='CANCEL' AND version>1 AND status='CANCELLED') OR
 (action='CLOSE' AND version>1 AND status='CLOSED')
);
ALTER TABLE certificate_request_events ADD CONSTRAINT certificate_event_message_check CHECK (
 (action NOT IN ('REQUEST_INFORMATION','RESPOND') OR (student_message IS NOT NULL AND length(btrim(student_message))>0)) AND
 (action <> 'RECORD_REVIEW' OR ((private_note IS NOT NULL AND length(btrim(private_note))>0) AND student_message IS NULL))
);
