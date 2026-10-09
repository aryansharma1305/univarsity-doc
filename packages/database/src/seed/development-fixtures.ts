import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * DEVELOPMENT FIXTURES ONLY — never run against a real university database.
 *
 * Every record is labelled as a fixture and uses unmistakable `DEV-` identifiers so it can never be
 * mistaken for official data. No results and no certificates are created. The grading scheme is an
 * explicit placeholder with no rules, because the real grading rules are unconfirmed.
 *
 * Idempotent: running it repeatedly converges on the same records.
 */
export const DEV_FIXTURE_LABEL = 'Development fixture — not real university data';

const PROGRAMS = [
  { code: 'DEV-PROG-A', name: 'Development Fixture Program A', durationSemesters: 8 },
  { code: 'DEV-PROG-B', name: 'Development Fixture Program B', durationSemesters: 4 },
] as const;

const SUBJECTS = [
  { code: 'DEV-SUB-101', name: 'Development Fixture Subject 101', credits: '4' },
  { code: 'DEV-SUB-102', name: 'Development Fixture Subject 102', credits: '4' },
  { code: 'DEV-SUB-103', name: 'Development Fixture Subject 103', credits: '3' },
] as const;

const STUDENTS = [
  { registrationNumber: 'DEV-REG-0001', fullName: 'Development Fixture Student One' },
  { registrationNumber: 'DEV-REG-0002', fullName: 'Development Fixture Student Two' },
] as const;

const CURRICULUM_VERSION = 'DEV-CURRICULUM-1';

export interface SeedSummary {
  departments: number;
  programs: number;
  academicSessions: number;
  subjects: number;
  programSubjects: number;
  gradingSchemes: number;
  studentRegistrations: number;
  examinations: number;
}

export async function seedDevelopmentFixtures(db: PrismaClient): Promise<SeedSummary> {
  return db.$transaction(async (tx) => {
    const department = await tx.department.upsert({
      where: { code: 'DEV-DEPT-01' },
      update: {},
      create: { code: 'DEV-DEPT-01', name: 'Development Fixture Department' },
    });

    const programs = [];
    for (const program of PROGRAMS) {
      programs.push(
        await tx.program.upsert({
          where: { code: program.code },
          update: {},
          create: { ...program, level: 'DEV-FIXTURE', departmentId: department.id },
        }),
      );
    }
    const [programA] = programs;
    if (!programA) throw new Error('Seed programs missing');

    const session = await tx.academicSession.upsert({
      where: { code: 'DEV-SESSION-01' },
      update: {},
      create: { code: 'DEV-SESSION-01', name: 'Development Fixture Session', status: 'ACTIVE' },
    });

    // A DRAFT curriculum version (Phase 7B): never activated or assigned by the seed.
    const curriculum = await tx.programCurriculum.upsert({
      where: {
        programId_versionCode: { programId: programA.id, versionCode: CURRICULUM_VERSION },
      },
      update: {},
      create: {
        programId: programA.id,
        versionCode: CURRICULUM_VERSION,
        name: 'Development Fixture Curriculum',
        structureType: 'SEMESTER_WISE',
        numberOfPeriods: programA.durationSemesters ?? 8,
      },
    });

    const programSubjects = [];
    for (const [index, subject] of SUBJECTS.entries()) {
      const record = await tx.subject.upsert({
        where: { code_version: { code: subject.code, version: 1 } },
        update: {},
        create: {
          code: subject.code,
          version: 1,
          name: subject.name,
          defaultCredits: subject.credits,
        },
      });
      programSubjects.push(
        await tx.programSubject.upsert({
          where: {
            programId_curriculumVersion_subjectId: {
              programId: programA.id,
              curriculumVersion: CURRICULUM_VERSION,
              subjectId: record.id,
            },
          },
          update: {},
          create: {
            programId: programA.id,
            curriculumId: curriculum.id,
            subjectId: record.id,
            semesterNumber: 1,
            displayOrder: index,
            curriculumVersion: CURRICULUM_VERSION,
            classification: 'THEORY',
            credits: subject.credits,
          },
        }),
      );
    }

    const gradingScheme = await tx.gradingScheme.upsert({
      where: { name_version: { name: 'DEV FIXTURE — NOT A REAL GRADING SCHEME', version: 1 } },
      update: {},
      create: {
        name: 'DEV FIXTURE — NOT A REAL GRADING SCHEME',
        version: 1,
        status: 'DRAFT',
        rules: {
          fixture: true,
          note: `${DEV_FIXTURE_LABEL}. Contains no grading rules: the university's rules are not yet confirmed.`,
        },
      },
    });

    for (const student of STUDENTS) {
      const normalized = student.registrationNumber.toUpperCase();
      const existing = await tx.studentRegistration.findUnique({
        where: { registrationNumberNormalized: normalized },
      });
      if (existing) continue;
      await tx.studentRegistration.create({
        data: {
          registrationNumber: student.registrationNumber,
          registrationNumberNormalized: normalized,
          rollReferenceNumber: student.registrationNumber.replace('DEV-REG', 'DEV-ROLL'),
          program: { connect: { id: programA.id } },
          department: { connect: { id: department.id } },
          academicSession: { connect: { id: session.id } },
          student: { create: { fullName: student.fullName } },
        },
      });
    }

    await tx.examination.upsert({
      where: { code: 'DEV-EXAM-0001' },
      update: {},
      create: {
        code: 'DEV-EXAM-0001',
        name: 'Development Fixture Examination',
        programId: programA.id,
        academicSessionId: session.id,
        semesterNumber: 1,
        examSession: 'DEV-FIXTURE',
        gradingSchemeId: gradingScheme.id,
        status: 'DRAFT',
      },
    });

    return {
      departments: 1,
      programs: programs.length,
      academicSessions: 1,
      subjects: SUBJECTS.length,
      programSubjects: programSubjects.length,
      gradingSchemes: 1,
      studentRegistrations: STUDENTS.length,
      examinations: 1,
    };
  });
}
