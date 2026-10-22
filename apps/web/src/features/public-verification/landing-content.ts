import {
  BookOpenCheckIcon,
  ClipboardCheckIcon,
  EyeOffIcon,
  FileClockIcon,
  FileTextIcon,
  FingerprintIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  LogInIcon,
  MonitorPlayIcon,
  RefreshCcwIcon,
  ScrollTextIcon,
  TicketIcon,
  UserRoundPenIcon,
  type LucideIcon,
} from 'lucide-react';

/*
 * Landing copy (UI-06). Every statement describes behaviour that exists in the code today
 * (CLAUDE.md §1, §10–10h). Public verification, result publication, certificate issuance, QR
 * verification and online payment are NOT claimed. No statistics, testimonials or partner logos.
 */

export interface StudentFeature {
  id: string;
  title: string;
  /** Short label shown on the illustrated portal screen. */
  screen: string;
  body: string;
  icon: LucideIcon;
  /** Shown as a plain-text note when part of the feature is not available yet. */
  note?: string;
}

export const STUDENT_FEATURES: readonly StudentFeature[] = [
  {
    id: 'profile',
    title: 'Your profile, and a way to correct it',
    screen: 'My Profile',
    body: 'See the official record the university holds for you. Ask for a missing date of birth or photo, or a correction to your name, parents’ names or gender — staff review every request before anything changes.',
    icon: UserRoundPenIcon,
  },
  {
    id: 'course',
    title: 'Your course, semester by semester',
    screen: 'Course Details',
    body: 'Find the curriculum version assigned to your registration, with its subjects laid out by semester or year.',
    icon: BookOpenCheckIcon,
  },
  {
    id: 'documents',
    title: 'Documents published to you',
    screen: 'My Documents',
    body: 'Download certificates and marksheets once university staff have published them to your personal library. No other student can see them.',
    icon: FileTextIcon,
  },
  {
    id: 'examinations',
    title: 'Examination access in one place',
    screen: 'Examinations',
    body: 'Open the links to the university’s examination application. Examinations themselves take place there, not in Docversity.',
    icon: MonitorPlayIcon,
  },
  {
    id: 're-exam',
    title: 'Re-exam applications, start to finish',
    screen: 'Re-exam',
    body: 'Apply for a re-exam one subject at a time and follow its status. Where a fee applies you see the payment instructions for your region, pay outside Docversity, and submit your transaction reference for staff to check.',
    icon: RefreshCcwIcon,
  },
  {
    id: 'results',
    title: 'Results, when the university releases them',
    screen: 'My Results',
    body: 'Your results page is ready and waiting. Results appear there only after the university publishes them.',
    note: 'Result publication is not available yet.',
    icon: FileClockIcon,
  },
];

export const STEPS = [
  {
    title: 'Get your activation code',
    body: 'The registrar’s office issues a single-use code for your registration. It expires if it is not used.',
    icon: TicketIcon,
  },
  {
    title: 'Activate your account',
    body: 'Enter your registration number, the code, and a new password of at least 12 characters.',
    icon: KeyRoundIcon,
  },
  {
    title: 'Sign in whenever you need',
    body: 'Use your registration number and password. Forgot your password? A new code from the registrar resets it.',
    icon: LogInIcon,
  },
] as const;

export const SAFEGUARDS = [
  {
    title: 'Only your own records',
    body: 'Your identity comes from your signed-in session, so the portal can only ever show your own registration, documents and requests.',
    icon: FingerprintIcon,
  },
  {
    title: 'Codes that cannot be reused',
    body: 'Activation codes are single use, expire, are stored only as a keyed hash and stop working after repeated wrong guesses.',
    icon: LockKeyholeIcon,
  },
  {
    title: 'Separate doors for staff',
    body: 'Staff and students sign in separately, with separate sessions. A student session never opens staff tools.',
    icon: ClipboardCheckIcon,
  },
  {
    title: 'Every staff change is recorded',
    body: 'Changes staff make to academic records are written to an append-only audit log in the same step.',
    icon: ScrollTextIcon,
  },
  {
    title: 'Photos without hidden data',
    body: 'Photos you send and image documents you receive are re-encoded without location or camera metadata.',
    icon: EyeOffIcon,
  },
] as const;
