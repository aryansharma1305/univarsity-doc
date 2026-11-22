import type { Prisma } from '@docversity/database';
import {
  type CertificateType,
  certificateTypeSchema,
  evaluateCourseDuration,
  resolveTypeEligibility,
} from '@docversity/validation';

/** An approved course set as the eligibility contract expects it (unknown stored types dropped). */
export function approvedEligibilityInput(row: {
  certificateTypes: string[];
  policyVersion: number;
  durationMonths: number;
}) {
  return {
    certificateTypes: row.certificateTypes.flatMap((t) => {
      const parsed = certificateTypeSchema.safeParse(t);
      return parsed.success ? [parsed.data] : [];
    }),
    policyVersion: row.policyVersion,
    durationMonths: row.durationMonths,
  };
}

/**
 * Whether a course may offer this certificate type: the university duration policy allows it AND
 * the course's independently APPROVED eligibility set includes it (ADR-0018). Fails closed.
 */
export async function courseTypeApproved(
  db: Prisma.TransactionClient,
  type: CertificateType,
  programId: string,
): Promise<boolean> {
  // Inside a transaction, hold the course and its approved set until commit so a concurrent
  // duration edit or supersession cannot slip between this check and the caller's write.
  await db.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid FOR SHARE`;
  await db.$queryRaw`SELECT id FROM program_certificate_eligibility WHERE program_id = ${programId}::uuid AND status = 'APPROVED' FOR SHARE`;
  const [program, approved] = await Promise.all([
    db.program.findUnique({
      where: { id: programId },
      select: { durationValue: true, durationUnit: true },
    }),
    db.programCertificateEligibility.findFirst({
      where: { programId, status: 'APPROVED' },
      select: { certificateTypes: true, policyVersion: true, durationMonths: true },
    }),
  ]);
  if (!program || !approved) return false;
  const evaluation = evaluateCourseDuration(program.durationValue, program.durationUnit);
  return (
    resolveTypeEligibility(evaluation, approvedEligibilityInput(approved))[type] ===
    'APPROVED_FOR_COURSE'
  );
}
