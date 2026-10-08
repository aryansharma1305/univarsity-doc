/**
 * SQLSTATE raised by every Docversity integrity trigger (see the core_academic_schema migration).
 */
export const DOMAIN_GUARD_SQLSTATE = 'DV001';

interface DriverCause {
  originalCode?: unknown;
  originalMessage?: unknown;
}

function driverCause(error: unknown): DriverCause | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return undefined;
  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return undefined;
  const cause = (adapterError as { cause?: unknown }).cause;
  return typeof cause === 'object' && cause !== null ? cause : undefined;
}

/** Prisma error code (e.g. "P2002"), if the value is a Prisma known-request error. */
export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
}

/** True when a database integrity trigger rejected the operation (SQLSTATE DV001). */
export function isDomainIntegrityViolation(error: unknown): boolean {
  return driverCause(error)?.originalCode === DOMAIN_GUARD_SQLSTATE;
}

/** The guard name (e.g. "results_guard") from a DV001 error message, for server-side logs only. */
export function domainGuardName(error: unknown): string | undefined {
  const message = driverCause(error)?.originalMessage;
  if (typeof message !== 'string') return undefined;
  return /^([a-z_]+):/.exec(message)?.[1];
}

/**
 * The name of the unique constraint/index a P2002 error violated (e.g. "programs_code_key"), so callers
 * can turn it into a field-level message.
 */
export function uniqueConstraintName(error: unknown): string | undefined {
  if (prismaErrorCode(error) !== 'P2002') return undefined;
  const cause = driverCause(error) as { constraint?: { index?: unknown } } | undefined;
  const index = cause?.constraint?.index;
  if (typeof index === 'string') return index;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return typeof target === 'string' ? target : Array.isArray(target) ? target.join('_') : undefined;
}
