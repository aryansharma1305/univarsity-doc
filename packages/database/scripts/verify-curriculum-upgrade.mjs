import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../../', import.meta.url));
process.loadEnvFile(join(root, '.env'));
const require = createRequire(join(root, 'packages/database/package.json'));
const pgRequire = createRequire(require.resolve('@prisma/adapter-pg'));
const { Client } = pgRequire('pg');
const url = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1'].includes(url.hostname));
const dbName = `${url.pathname.slice(1)}_7b_upgrade_verify`;
assert(/^[a-z0-9_]+_7b_upgrade_verify$/.test(dbName));
const admin = new Client({ connectionString: url.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${dbName}"`);
url.pathname = `/${dbName}`;
const db = new Client({ connectionString: url.toString() });
await db.connect();
try {
  const dir = join(root, 'packages/database/prisma/migrations');
  const migrations = readdirSync(dir)
    .filter((n) => /^\d/.test(n))
    .sort();
  for (const n of migrations.filter((n) => n < '20261011090000')) {
    await db.query(readFileSync(join(dir, n, 'migration.sql'), 'utf8'));
  }
  const [
    program,
    otherProgram,
    student,
    session,
    registration,
    subject,
    assignment,
    exam,
    result,
    item,
  ] = Array.from({ length: 10 }, randomUUID);
  await db.query(
    `INSERT INTO programs(id,code,name,duration_semesters,updated_at) VALUES ($1,'SYN-UPGRADE','Synthetic legacy course',4,NOW()), ($2,'SYN-OTHER','Synthetic unrelated course',NULL,NOW())`,
    [program, otherProgram],
  );
  await db.query(
    `INSERT INTO students(id,full_name,updated_at) VALUES($1,'Synthetic Upgrade Student',NOW())`,
    [student],
  );
  await db.query(
    `INSERT INTO academic_sessions(id,code,name,updated_at) VALUES($1,'SYN-UPGRADE','Synthetic legacy session',NOW())`,
    [session],
  );
  await db.query(
    `INSERT INTO student_registrations(id,student_id,registration_number,registration_number_normalized,program_id,academic_session_id,updated_at) VALUES($1,$2,'SYN-UPGRADE-REG','SYN-UPGRADE-REG',$3,$4,NOW())`,
    [registration, student, program, session],
  );
  await db.query(
    `INSERT INTO subjects(id,code,name,updated_at) VALUES($1,'SYN-UPGRADE-SUB','Synthetic legacy subject',NOW())`,
    [subject],
  );
  await db.query(
    `INSERT INTO program_subjects(id,program_id,subject_id,semester_number,curriculum_version,credits,max_marks,pass_marks,updated_at) VALUES($1,$2,$3,2,'LEGACY-2025',4,100,40,NOW())`,
    [assignment, program, subject],
  );
  await db.query(
    `INSERT INTO examinations(id,code,name,program_id,academic_session_id,semester_number,exam_session,updated_at) VALUES($1,'SYN-UPGRADE-EXAM','Synthetic historical exam',$2,$3,2,'SYNTHETIC',NOW())`,
    [exam, program, session],
  );
  await db.query(
    `INSERT INTO results(id,student_registration_id,examination_id,updated_at) VALUES($1,$2,$3,NOW())`,
    [result, registration, exam],
  );
  await db.query(
    `INSERT INTO result_items(id,result_id,program_subject_id,total_marks,max_marks,status,updated_at) VALUES($1,$2,$3,80,100,'PASS',NOW())`,
    [item, result, assignment],
  );
  await db.query(
    `UPDATE results SET publication_status='PUBLISHED', outcome='PASS', published_at=NOW() WHERE id=$1`,
    [result],
  );
  const oldReg = (await db.query('SELECT * FROM student_registrations WHERE id=$1', [registration]))
    .rows[0];
  const oldLine = (await db.query('SELECT * FROM program_subjects WHERE id=$1', [assignment]))
    .rows[0];
  const oldResult = (await db.query('SELECT * FROM results WHERE id=$1', [result])).rows[0];
  const oldItem = (await db.query('SELECT * FROM result_items WHERE id=$1', [item])).rows[0];
  const [largeProgram, largeSubject, largeAssignment] = Array.from({ length: 3 }, randomUUID);
  await db.query(
    `INSERT INTO programs(id,code,name,duration_semesters,updated_at) VALUES($1,'SYN-LARGE','Synthetic legacy 41-period course',41,NOW())`,
    [largeProgram],
  );
  await db.query(
    `INSERT INTO subjects(id,code,name,updated_at) VALUES($1,'SYN-LARGE-SUB','Synthetic legacy period 41 subject',NOW())`,
    [largeSubject],
  );
  await db.query(
    `INSERT INTO program_subjects(id,program_id,subject_id,semester_number,curriculum_version,credits,updated_at) VALUES($1,$2,$3,41,'LEGACY-41',3,NOW())`,
    [largeAssignment, largeProgram, largeSubject],
  );
  for (const n of migrations.filter((n) => n >= '20261011090000'))
    await db.query(readFileSync(join(dir, n, 'migration.sql'), 'utf8'));
  const reg = (await db.query('SELECT * FROM student_registrations WHERE id=$1', [registration]))
    .rows[0];
  const { curriculum_id, ...keptReg } = reg;
  assert.equal(curriculum_id, null);
  assert.deepEqual(keptReg, oldReg);
  const line = (await db.query('SELECT * FROM program_subjects WHERE id=$1', [assignment])).rows[0];
  const { curriculum_id: curriculum, classification, display_order, ...keptLine } = line;
  assert.deepEqual(keptLine, oldLine);
  assert.equal(classification, null);
  assert.equal(display_order, 0);
  const c = (await db.query('SELECT * FROM program_curricula WHERE id=$1', [curriculum])).rows[0];
  assert.equal(c.version_code, 'LEGACY-2025');
  assert.equal(c.number_of_periods, 4);
  assert.equal(c.status, 'DRAFT');
  assert.deepEqual((await db.query('SELECT * FROM results WHERE id=$1', [result])).rows[0], {
    ...oldResult,
    version: 1,
  });
  assert.deepEqual((await db.query('SELECT * FROM result_items WHERE id=$1', [item])).rows[0], {
    ...oldItem,
    re_exam_application_id: null,
  });
  const largeCourse = (
    await db.query(
      'SELECT duration_semesters, academic_structure, period_count FROM programs WHERE id=$1',
      [largeProgram],
    )
  ).rows[0];
  assert.deepEqual(largeCourse, {
    duration_semesters: 41,
    academic_structure: null,
    period_count: null,
  });
  const largeLine = (
    await db.query('SELECT semester_number, curriculum_id FROM program_subjects WHERE id=$1', [
      largeAssignment,
    ])
  ).rows[0];
  assert.equal(largeLine.semester_number, 41);
  await assert.rejects(
    db.query("UPDATE program_curricula SET status='ACTIVE', activated_at=NOW() WHERE id=$1", [
      largeLine.curriculum_id,
    ]),
    /outside declared periods/,
  );
  assert.equal(
    (await db.query('SELECT status FROM program_curricula WHERE id=$1', [largeLine.curriculum_id]))
      .rows[0].status,
    'DRAFT',
  );
  assert.equal(
    (
      await db.query('SELECT COUNT(*)::int AS n FROM program_curricula WHERE program_id=$1', [
        otherProgram,
      ])
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query('UPDATE program_subjects SET credits=9 WHERE id=$1', [assignment]),
    /referenced by results/,
  );
  await assert.rejects(
    db.query("UPDATE subjects SET name='Rewritten' WHERE id=$1", [subject]),
    /academic history/,
  );
  console.log(
    'PASS: synthetic Phase 7 database upgraded through Phase 7B migrations; legacy identity/registration/result rows preserved; curriculum backfill verified; historic guards enforced.',
  );
} finally {
  await db.end();
  await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
}
