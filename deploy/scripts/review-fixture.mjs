// Phase 14B: synthetic university-review data and least-privilege reviewer accounts.
// Staging-only, never university data. No approval, publication, issuance or payment state is written:
// reviewers exercise those workflows (and their policy gates) through the application itself.
import { readFileSync } from 'node:fs';
import { createPrismaClient } from '/app/packages/database/dist/index.js';
import { PasswordService } from '/app/apps/api/dist/auth/password.service.js';
import { ensureRoles } from '/app/apps/api/dist/cli/roles.js';

const url = new URL(process.env.DATABASE_URL);
// The Compose service, or (Phase 14C) the exact Render staging host validated by render.py.
const stagingHost = process.env.STAGING_DATABASE_HOST ?? 'postgres';
if (url.hostname !== stagingHost || url.pathname !== '/docversity_staging')
  throw Error('Not isolated staging');
const reviewers = JSON.parse(readFileSync('/credentials/reviewers.json', 'utf8'));
const passwords = new PasswordService();
const db = createPrismaClient({ connectionString: url.toString() });
try {
  if (await db.program.count({ where: { code: { startsWith: 'REVIEW-' } } }))
    throw Error('Review fixture already exists; refusing to create it twice');
  // Only clearly synthetic records may exist before review data is added.
  if (await db.student.count({ where: { NOT: { fullName: { startsWith: 'SYNTHETIC ' } } } }))
    throw Error('Staging contains a non-synthetic student; refusing');

  await ensureRoles(db);
  for (const account of reviewers.staff) {
    const role = await db.role.findUniqueOrThrow({ where: { name: account.role } });
    await db.user.create({
      data: {
        email: account.email,
        displayName: account.displayName,
        passwordHash: await passwords.hashPassword(account.password),
        roles: { create: { roleId: role.id } },
      },
    });
  }

  const science = await db.department.create({
    data: { code: 'REVIEW-SCI', name: 'SYNTHETIC School of Applied Sciences' },
  });
  const management = await db.department.create({
    data: { code: 'REVIEW-MGT', name: 'SYNTHETIC School of Management Studies' },
  });
  const session = await db.academicSession.create({
    data: {
      code: 'REVIEW-2026',
      name: 'SYNTHETIC Review Session 2026–27',
      status: 'ACTIVE',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    },
  });
  // Several course durations, so the university course-duration policy and its unresolved
  // 12-month case are visible. No certificate set is proposed or approved here.
  const course = (data) => db.program.create({ data: { status: 'ACTIVE', ...data } });
  const bachelor = await course({
    code: 'REVIEW-BSC-3Y',
    name: 'SYNTHETIC Bachelor of Science in Data Studies',
    level: 'UG',
    academicStructure: 'SEMESTER_WISE',
    periodCount: 6,
    durationValue: 3,
    durationUnit: 'YEARS',
    departmentId: science.id,
  });
  const diploma = await course({
    code: 'REVIEW-PGD-2Y',
    name: 'SYNTHETIC Postgraduate Diploma in Management',
    level: 'PG',
    academicStructure: 'YEAR_WISE',
    periodCount: 2,
    durationValue: 2,
    durationUnit: 'YEARS',
    departmentId: management.id,
  });
  const shortCourse = await course({
    code: 'REVIEW-CERT-3M',
    name: 'SYNTHETIC Certificate Course in Laboratory Safety',
    level: 'CERTIFICATE',
    durationValue: 3,
    durationUnit: 'MONTHS',
    departmentId: science.id,
  });
  const oneYear = await course({
    code: 'REVIEW-DIP-1Y',
    name: 'SYNTHETIC One-Year Diploma in Office Practice',
    level: 'DIPLOMA',
    durationValue: 1,
    durationUnit: 'YEARS',
    departmentId: management.id,
  });
  for (const [code, name, category] of [
    ['REVIEW-DS101', 'SYNTHETIC Foundations of Data', 'THEORY'],
    ['REVIEW-DS102', 'SYNTHETIC Statistics Laboratory', 'PRACTICAL'],
    ['REVIEW-DS201', 'SYNTHETIC Databases and Records', 'COMBINED'],
    ['REVIEW-MG101', 'SYNTHETIC Principles of Management', 'THEORY'],
    ['REVIEW-MG102', 'SYNTHETIC Accounting for Managers', 'THEORY'],
  ])
    await db.subject.create({ data: { code, name, category, defaultCredits: 4 } });

  const register = (number, program, department) => ({
    registrationNumber: number,
    registrationNumberNormalized: number,
    programId: program.id,
    departmentId: department.id,
    academicSessionId: session.id,
    admissionDate: new Date('2026-07-15'),
  });
  // The student reviewer: an activated account with three registrations.
  await db.student.create({
    data: {
      fullName: 'SYNTHETIC Asha Reviewer',
      fatherName: 'SYNTHETIC Parent One',
      motherName: 'SYNTHETIC Parent Two',
      gender: 'Female',
      registrations: {
        create: [
          register(reviewers.student.registrationNumber, bachelor, science),
          register('REVIEW-REG-1002', shortCourse, science),
          register('REVIEW-REG-1003', oneYear, management),
        ],
      },
      account: {
        create: { passwordHash: await passwords.hashPassword(reviewers.student.password) },
      },
    },
  });
  // Students without portal accounts: staff can issue activation codes and manage their records.
  const others = [
    ['SYNTHETIC Ben Example', bachelor, science],
    ['SYNTHETIC Chitra Example', bachelor, science],
    ['SYNTHETIC Dev Example', diploma, management],
    ['SYNTHETIC Esha Example', diploma, management],
    ['SYNTHETIC Farid Example', shortCourse, science],
    ['SYNTHETIC Gita Example', oneYear, management],
  ];
  for (const [index, [fullName, program, department]] of others.entries())
    await db.student.create({
      data: {
        fullName,
        registrations: { create: register(`REVIEW-REG-${2001 + index}`, program, department) },
      },
    });
  console.log(
    'Created synthetic review data and reviewer accounts; credentials remain in the private staging directory.',
  );
} finally {
  await db.$disconnect();
}
