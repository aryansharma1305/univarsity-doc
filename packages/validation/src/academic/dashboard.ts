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

/** Admin dashboard: real counts only. `recentActivity` is null when the user may not read the audit log. */
export const dashboardSchema = z
  .object({
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
