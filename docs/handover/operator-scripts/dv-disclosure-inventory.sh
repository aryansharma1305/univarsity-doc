#!/bin/bash
# READ-ONLY inventory for public-verification rollout: courses, current policy per service,
# roll-number coverage, issued documents, published results, eligible staff and the server flag.
# Prints codes, counts and staff display names only — no student names, numbers or contact details.
# Run: sudo bash /tmp/dv-disclosure-inventory.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
P=docversity-university-407e5ed2
svc() { docker ps -q --filter "label=com.docker.compose.project=$P" --filter "label=com.docker.compose.service=$1"; }
PG=$(svc postgres); API=$(svc api)
[ -n "$PG" ] && [ -n "$API" ] || { echo "ABORT: postgres/api container not found"; exit 1; }
q() { docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$PG" psql -v ON_ERROR_STOP=1 -U docversity_owner -d docversity_university -AtF ' | ' </dev/null -c "$1"; }
h() { echo; echo "=== $*"; }

h "R0 read-only session"
q "show default_transaction_read_only"

h "R1 server flag (approval is refused while false)"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API" | grep -E '^OFFICIAL_VERIFICATION_ENABLED=' || echo "OFFICIAL_VERIFICATION_ENABLED not set (defaults apply)"

h "C1 courses: code | name | status | level | duration | department | active regs | all regs"
q "select p.code, p.name, p.status, coalesce(p.level,'-'),
     coalesce(p.duration_value::text||' '||lower(p.duration_unit::text),'-'), coalesce(d.name,'-'),
     (select count(*) from student_registrations r where r.program_id=p.id and r.status='ACTIVE'),
     (select count(*) from student_registrations r where r.program_id=p.id)
   from programs p left join departments d on d.id=p.department_id order by p.code"

h "P1 current policy per course and service: course | service | policy | approved | anonymous | fields | QR document | institution | authorization ref set"
q "with cur as (
     select distinct on (program_id, service) * from verification_policies
     where status='APPROVED' order by program_id, service, created_at desc, id desc)
   select p.code, s.service, coalesce(right(c.id::text,8),'NONE'), coalesce(date(c.approved_at)::text,'-'),
     coalesce((c.definition #>> '{publicDisclosure,anonymousLookup}'),'false'),
     coalesce((select string_agg(f,',') from jsonb_array_elements_text(c.definition #> '{publicDisclosure,fields}') f),'-'),
     coalesce((c.definition #>> '{publicDisclosure,documentWithCredential}'),'false'),
     coalesce(c.definition->>'institutionName','-'),
     case when coalesce(c.definition->>'authorizationReference','')<>'' then 'yes' else 'no' end
   from programs p
   cross join (values ('registration'),('admission-letter'),('certificate'),('result')) s(service)
   left join cur c on c.program_id=p.id and c.service=s.service
   order by p.code, s.service"

h "P2 open DRAFT proposals (would be approved as-is): course | service | draft | created | proposer"
q "select p.code, v.service, right(v.id::text,8), date(v.created_at), u.display_name
   from verification_policies v join programs p on p.id=v.program_id join users u on u.id=v.proposed_by_id
   where v.status='DRAFT' order by p.code, v.service, v.created_at"

h "P3 policies by service and status"
q "select service, status, count(*) from verification_policies group by 1,2 order by 1,2"

h "N1 roll-number readiness: course | regs | with roll no. | missing | roll nos. shared by >1 reg"
q "select p.code, count(r.id), count(r.roll_reference_number), count(r.id)-count(r.roll_reference_number),
     (select count(*) from (select roll_reference_number from student_registrations x
        where x.program_id=p.id and x.roll_reference_number is not null
        group by 1 having count(*)>1) d)
   from programs p left join student_registrations r on r.program_id=p.id
   group by p.id, p.code order by p.code"

h "D1 official documents: course | type | status | count"
q "select p.code, c.document_type, c.status, count(*) from certificates c join programs p on p.id=c.program_id
   group by 1,2,3 order by 1,2,3"
q "select 'documents total: '||count(*) from certificates"

h "E1 published results: course | publications"
q "select p.code, count(*) from result_publications rp join results r on r.id=rp.result_id
   join examinations e on e.id=r.examination_id join programs p on p.id=e.program_id group by 1 order by 1"
q "select 'result publications total: '||count(*) from result_publications"

h "S1 staff who can propose/approve (SUPER_ADMIN): name | status | MFA | password change pending"
q "select u.display_name, u.status, case when u.mfa_enabled_at is null then 'no' else 'yes' end,
     u.password_change_required
   from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id
   where r.name='SUPER_ADMIN' order by u.created_at"

echo; echo "INVENTORY COMPLETE — read-only, nothing changed"
