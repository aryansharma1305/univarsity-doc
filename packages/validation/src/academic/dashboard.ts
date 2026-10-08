import { z } from 'zod';
import { activityItemSchema } from './common.js';

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
  })
  .meta({ id: 'Dashboard' });

export type Dashboard = z.infer<typeof dashboardSchema>;
