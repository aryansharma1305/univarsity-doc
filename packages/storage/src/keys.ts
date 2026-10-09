import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function assertUuid(value: string): void {
  if (!UUID.test(value)) throw new Error('Object keys are built from generated UUIDs only');
}

/**
 * Generated object keys. Keys contain only fixed prefixes, generated UUIDs and a fixed extension,
 * so user input (e.g. an uploaded file's name) can never influence where an object is stored.
 */
export const objectKeys = {
  /** The uploaded source workbook of an import. */
  importSource(importJobId: string): string {
    assertUuid(importJobId);
    return `imports/${importJobId}/source-${randomUUID()}.xlsx`;
  },
  /** A generated error report of an import (a new key per generation). */
  importErrorReport(importJobId: string): string {
    assertUuid(importJobId);
    return `imports/${importJobId}/error-report-${randomUUID()}.xlsx`;
  },
  /** A staff-uploaded historical document of one registration (original bytes, fixed extension). */
  historicalDocument(registrationId: string, extension: 'pdf' | 'jpg' | 'png'): string {
    assertUuid(registrationId);
    return `documents/${registrationId}/${randomUUID()}.${extension}`;
  },
  /**
   * The student copy of an image document: re-encoded without embedded metadata. A separate,
   * never-overwritten object beside the untouched original.
   */
  historicalDocumentStudentCopy(registrationId: string, extension: 'jpg' | 'png'): string {
    assertUuid(registrationId);
    return `documents/${registrationId}/student-copy-${randomUUID()}.${extension}`;
  },
  /**
   * A student's staged profile photo (normalised JPEG). On approval the same immutable object
   * becomes the official photo, so it is never overwritten.
   */
  profileRequestPhoto(studentId: string): string {
    assertUuid(studentId);
    return `students/${studentId}/photos/${randomUUID()}.jpg`;
  },
  /**
   * The QR image of a re-exam payment destination (re-encoded, without metadata). A new key per
   * upload; approved destinations are frozen, so a referenced QR is never overwritten.
   */
  paymentDestinationQr(destinationId: string, extension: 'png' | 'jpg'): string {
    assertUuid(destinationId);
    return `payments/destinations/${destinationId}/qr-${randomUUID()}.${extension}`;
  },
  /** Evidence a student attached to a re-exam payment submission. */
  reExamPaymentEvidence(paymentId: string, extension: 'pdf' | 'jpg' | 'png'): string {
    assertUuid(paymentId);
    return `payments/evidence/${paymentId}/${randomUUID()}.${extension}`;
  },
};
