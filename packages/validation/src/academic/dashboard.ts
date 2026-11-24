import { z } from 'zod';
import { activityItemSchema, optionalFilter } from './common.js';

const count = z.number().int().nonnegative();
/** A count the user may not see is null, never 0. */
const scoped = count.nullable();

export const dashboardQuerySchema = z
  .object({ academicSessionId: optionalFilter(z.uuid()) })
  .strict()
  .meta({ id: 'DashboardQuery' });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const enrolmentRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  activeRegistrations: count,
});

/**
 * Workload counts with no reliable academic-session link (student-level requests, inboxes,
 * notifications). They are always totals across all sessions and the dashboard labels them so.
 */
export const DASHBOARD_GLOBAL_WORKLOAD = [
  'profileRequestsPending',
  'certificateRequestsAwaitingStaff',
  'messagesAwaitingReply',
  'verificationQueriesOpen',
  'unreadNotifications',
] as const;

/** Admin dashboard: real counts only. `recentActivity` is null when the user may not read the audit log. */
export const dashboardSchema = z
  .object({
    /** The session every session-linked count is limited to; null = all sessions. */
    academicSession: z
      .object({ id: z.uuid(), code: z.string(), name: z.string(), status: z.string() })
      .nullable(),
    counts: z.object({
      students: z.number().int(),
      activeRegistrations: z.number().int(),
      programs: z.number().int(),
      academicSessions: z.number().int(),
    }),
    recentActivity: z.array(activityItemSchema).nullable(),
    /** Queues awaiting staff action, each null without its read permission. */
    workload: z.object({
      profileRequestsPending: scoped,
      certificateRequestsAwaitingStaff: scoped,
      reExamApplicationsPending: scoped,
      reExamPaymentsPending: scoped,
      resultsDraft: scoped,
      resultsUnderReview: scoped,
      resultsPublished: scoped,
      resultsWithheld: scoped,
      documentsAwaitingApproval: scoped,
      documentsIssued: scoped,
      admissionLettersIssued: scoped,
      messagesAwaitingReply: scoped,
      verificationQueriesOpen: scoped,
      unreadNotifications: count,
    }),
    /** Active registrations per course and per session; null without registrations.read. */
    enrolment: z
      .object({
        academicSessionId: z.uuid().nullable(),
        byProgram: z.array(enrolmentRowSchema),
        bySession: z.array(enrolmentRowSchema),
      })
      .nullable(),
  })
  .meta({ id: 'Dashboard' });

export type Dashboard = z.infer<typeof dashboardSchema>;
