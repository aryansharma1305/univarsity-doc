import { z } from 'zod';
import {
  listQuerySchema,
  nameSchema,
  optionalFilter,
  optionalText,
  paginatedSchema,
} from '../academic/common.js';

/**
 * Chat & Communication (in-app only — no email, SMS or WhatsApp delivery exists):
 * - student messages: a student's private conversations with the administration (shared inbox);
 * - verification queries: support queries from students and external verifiers, answered by staff;
 * - notifications: per-recipient in-app notices with read state.
 */

const messageText = (max: number, empty: string) =>
  z.string().trim().min(1, empty).max(max, `Use at most ${max} characters.`);

export const MESSAGE_RULES = { subjectMax: 200, bodyMax: 4000 } as const;

// ---------------------------------------------------------------------------------------------
// Student messages
// ---------------------------------------------------------------------------------------------

export const messageThreadStatusSchema = z.enum(['OPEN', 'RESOLVED']);
export type MessageThreadStatus = z.infer<typeof messageThreadStatusSchema>;

export const createMessageThreadSchema = z
  .object({
    subject: messageText(MESSAGE_RULES.subjectMax, 'Enter a subject.'),
    body: messageText(MESSAGE_RULES.bodyMax, 'Write a message.'),
  })
  .strict();
export type CreateMessageThread = z.infer<typeof createMessageThreadSchema>;

export const messageReplySchema = z
  .object({ body: messageText(MESSAGE_RULES.bodyMax, 'Write a message.') })
  .strict();
export type MessageReply = z.infer<typeof messageReplySchema>;

/** One message. Students see staff replies as "University administration", never staff names. */
export const threadMessageSchema = z.object({
  id: z.uuid(),
  author: z.enum(['STUDENT', 'STAFF']),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type ThreadMessage = z.infer<typeof threadMessageSchema>;

export const messageThreadSummarySchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  status: messageThreadStatusSchema,
  /** Unread for the viewer: the student, or the shared staff inbox. */
  unread: z.boolean(),
  lastMessageAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /** Staff views only. */
  student: z
    .object({ id: z.uuid(), fullName: z.string(), registrationNumber: z.string().nullable() })
    .optional(),
});
export type MessageThreadSummary = z.infer<typeof messageThreadSummarySchema>;

export const messageThreadDetailSchema = messageThreadSummarySchema.extend({
  messages: z.array(threadMessageSchema),
});
export type MessageThreadDetail = z.infer<typeof messageThreadDetailSchema>;

export const messageThreadListSchema = paginatedSchema(messageThreadSummarySchema);
export type MessageThreadList = z.infer<typeof messageThreadListSchema>;

export const messageThreadQuerySchema = listQuerySchema(['lastMessageAt', 'createdAt'], 'lastMessageAt', {
  status: optionalFilter(messageThreadStatusSchema),
  unread: optionalFilter(z.enum(['true'])),
});
export type MessageThreadQuery = z.infer<typeof messageThreadQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Verification queries
// ---------------------------------------------------------------------------------------------

export const VERIFICATION_QUERY_CATEGORIES = [
  'RECORD_NOT_FOUND',
  'DETAILS_MISMATCH',
  'HOW_TO_VERIFY',
  'OTHER',
] as const;
export const verificationQueryCategorySchema = z.enum(VERIFICATION_QUERY_CATEGORIES);
export type VerificationQueryCategory = z.infer<typeof verificationQueryCategorySchema>;
export const VERIFICATION_QUERY_CATEGORY_LABELS: Record<VerificationQueryCategory, string> = {
  RECORD_NOT_FOUND: 'A record could not be found',
  DETAILS_MISMATCH: 'Details do not match',
  HOW_TO_VERIFY: 'How to verify a document',
  OTHER: 'Something else',
};

export const verificationQueryStatusSchema = z.enum(['OPEN', 'ANSWERED', 'RESOLVED']);
export type VerificationQueryStatus = z.infer<typeof verificationQueryStatusSchema>;
export const verificationQuerySourceSchema = z.enum(['STUDENT', 'PUBLIC']);

/** Reference shown to the requester: VQ- + 8 Crockford base32 characters. */
export const verificationQueryReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^VQ-[0-9A-HJKMNP-TV-Z]{8}$/, 'Enter the reference exactly as shown, e.g. VQ-7KQ2M9XA.');

const queryFields = {
  category: verificationQueryCategorySchema,
  documentReference: optionalText(100),
  message: messageText(MESSAGE_RULES.bodyMax, 'Describe your query.'),
};

export const studentVerificationQuerySchema = z.object(queryFields).strict();
export type StudentVerificationQueryInput = z.infer<typeof studentVerificationQuerySchema>;

export const publicVerificationQuerySchema = z
  .object({
    requesterName: nameSchema,
    organization: optionalText(200),
    contactEmail: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.email('Enter a valid email address.').max(254).nullable().optional(),
    ),
    ...queryFields,
  })
  .strict();
export type PublicVerificationQueryInput = z.infer<typeof publicVerificationQuerySchema>;

/** Returned once on public submission: the access code is never shown again. */
export const publicVerificationQueryReceiptSchema = z.object({
  reference: z.string(),
  accessCode: z.string(),
  status: verificationQueryStatusSchema,
});
export type PublicVerificationQueryReceipt = z.infer<typeof publicVerificationQueryReceiptSchema>;

export const publicVerificationQueryStatusRequestSchema = z
  .object({
    reference: verificationQueryReferenceSchema,
    accessCode: z.string().trim().min(1, 'Enter the access code.').max(64),
  })
  .strict();
export type PublicVerificationQueryStatusRequest = z.infer<
  typeof publicVerificationQueryStatusRequestSchema
>;

/** What a requester may see: their own query and the staff answer — never any record data. */
export const requesterVerificationQuerySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: verificationQueryStatusSchema,
  category: verificationQueryCategorySchema,
  documentReference: z.string().nullable(),
  message: z.string(),
  response: z.string().nullable(),
  respondedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type RequesterVerificationQuery = z.infer<typeof requesterVerificationQuerySchema>;
export const requesterVerificationQueryListSchema = z.object({
  data: z.array(requesterVerificationQuerySchema),
});
export type RequesterVerificationQueryList = z.infer<typeof requesterVerificationQueryListSchema>;

export const staffVerificationQuerySchema = requesterVerificationQuerySchema.extend({
  source: verificationQuerySourceSchema,
  requesterName: z.string(),
  organization: z.string().nullable(),
  contactEmail: z.string().nullable(),
  student: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});
export type StaffVerificationQuery = z.infer<typeof staffVerificationQuerySchema>;
export const staffVerificationQueryListSchema = paginatedSchema(staffVerificationQuerySchema);
export type StaffVerificationQueryList = z.infer<typeof staffVerificationQueryListSchema>;

export const verificationQueryListQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  status: optionalFilter(verificationQueryStatusSchema),
  source: optionalFilter(verificationQuerySourceSchema),
});
export type VerificationQueryListQuery = z.infer<typeof verificationQueryListQuerySchema>;

export const respondVerificationQuerySchema = z
  .object({
    response: messageText(MESSAGE_RULES.bodyMax, 'Write a response.'),
    resolve: z.boolean().default(false),
    version: z.number().int().positive(),
  })
  .strict();
export type RespondVerificationQuery = z.infer<typeof respondVerificationQuerySchema>;

export const resolveVerificationQuerySchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type ResolveVerificationQuery = z.infer<typeof resolveVerificationQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'MESSAGE_RECEIVED',
  'MESSAGE_REPLY',
  'PROFILE_REQUEST_APPROVED',
  'PROFILE_REQUEST_REJECTED',
  'CERTIFICATE_REQUEST_UPDATED',
  'VERIFICATION_QUERY_RECEIVED',
  'VERIFICATION_QUERY_ANSWERED',
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;
export const notificationListSchema = paginatedSchema(notificationSchema);
export type NotificationList = z.infer<typeof notificationListSchema>;

export const notificationQuerySchema = listQuerySchema(['createdAt'], 'createdAt', {
  unread: optionalFilter(z.enum(['true'])),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof unreadCountSchema>;
