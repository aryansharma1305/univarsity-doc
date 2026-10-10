import type { Route } from 'next';
import {
  AwardIcon,
  BookOpenIcon,
  ClipboardCheckIcon,
  ClipboardPenLineIcon,
  FileBadgeIcon,
  KeyRoundIcon,
  LifeBuoyIcon,
  type LucideIcon,
  QrCodeIcon,
  RotateCcwIcon,
  SettingsIcon,
  UserCheckIcon,
  UserRoundIcon,
  UserRoundPenIcon,
  WalletIcon,
} from 'lucide-react';

/**
 * Landing page content, written for students — the page's main audience. Every feature listed maps
 * to a working student portal page (see CLAUDE.md §1 and app/student); anything not built yet is
 * flagged `upcoming` and rendered with an explicit badge, never as live.
 */

export type Availability = 'live' | 'upcoming';

export interface QuickLink {
  href: Route;
  title: string;
  description: string;
  icon: LucideIcon;
  availability: Availability;
}

export const STUDENT_LINKS: readonly QuickLink[] = [
  {
    href: '/student/login',
    title: 'Student Login',
    description: 'Sign in with your registration number and password.',
    icon: KeyRoundIcon,
    availability: 'live',
  },
  {
    href: '/student/register',
    title: 'Activate Student Account',
    description: 'First time here? Use the activation code issued by your university.',
    icon: UserCheckIcon,
    availability: 'live',
  },
  {
    href: '/help',
    title: 'Help',
    description: 'Answers about activation, sign-in and the student portal.',
    icon: LifeBuoyIcon,
    availability: 'live',
  },
];

/** Public verification services — all planned, none live yet. */
export const PUBLIC_SERVICES: readonly QuickLink[] = [
  {
    href: '/results',
    title: 'Check Results',
    description: 'Look up published semester results.',
    icon: ClipboardCheckIcon,
    availability: 'upcoming',
  },
  {
    href: '/verify/registration',
    title: 'Registration Verification',
    description: 'Confirm a registration number belongs to an enrolled student.',
    icon: UserCheckIcon,
    availability: 'upcoming',
  },
  {
    href: '/verify/certificate',
    title: 'Certificate Verification',
    description: 'Check a certificate number against issued records.',
    icon: AwardIcon,
    availability: 'upcoming',
  },
  {
    href: '/verify/qr',
    title: 'Scan QR',
    description: 'Verify a printed document by its QR code.',
    icon: QrCodeIcon,
    availability: 'upcoming',
  },
];

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

/** Student portal pages that work today. */
export const FEATURES: readonly Feature[] = [
  {
    title: 'Your profile',
    description: 'Your personal and academic details, exactly as the university holds them.',
    icon: UserRoundIcon,
  },
  {
    title: 'Your course',
    description:
      'Your program, registrations and the curriculum assigned to you, semester by semester.',
    icon: BookOpenIcon,
  },
  {
    title: 'Your documents',
    description: 'Download certificates and marksheets the university has published to you.',
    icon: FileBadgeIcon,
  },
  {
    title: 'Examinations',
    description: 'See your examinations and the links to take them in the university’s exam app.',
    icon: ClipboardPenLineIcon,
  },
  {
    title: 'Re-exam applications',
    description: 'Apply for a re-examination online and follow its status until it is decided.',
    icon: RotateCcwIcon,
  },
  {
    title: 'Re-exam payments',
    description:
      'See the payment details for your region and submit your transaction reference for checking.',
    icon: WalletIcon,
  },
  {
    title: 'Profile corrections',
    description:
      'Request a correction to your name or date of birth. University staff review it before your record changes.',
    icon: UserRoundPenIcon,
  },
  {
    title: 'Account settings',
    description: 'Your account and sign-in details, and how to recover access if you need to.',
    icon: SettingsIcon,
  },
];

export interface RoadmapStage {
  title: string;
  description: string;
  availability: Availability;
}

/** What students have now and what is planned. No dates until the university confirms them. */
export const ROADMAP: readonly RoadmapStage[] = [
  {
    title: 'Student portal',
    description: 'Profile, course, documents, examinations, re-exam applications and payments.',
    availability: 'live',
  },
  {
    title: 'Semester results',
    description: 'Your published results, in your portal.',
    availability: 'upcoming',
  },
  {
    title: 'Notifications',
    description: 'A heads-up in your portal when something on your record changes.',
    availability: 'upcoming',
  },
  {
    title: 'Public verification',
    description:
      'Anyone you share it with can check a result, registration or certificate, including by QR code.',
    availability: 'upcoming',
  },
];

export interface Step {
  title: string;
  description: string;
}

export const STEPS: readonly Step[] = [
  {
    title: 'Get your activation code',
    description:
      'Your university issues you a one-time activation code. Ask the registrar’s office if you have not received one.',
  },
  {
    title: 'Activate your account',
    description:
      'Enter your registration number and the activation code, then choose your own password.',
  },
  {
    title: 'Sign in',
    description: 'From now on, sign in with your registration number and your password.',
  },
  {
    title: 'Use your portal',
    description: 'See your profile, course, documents and examinations on your phone or laptop.',
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: 'Where do I get my activation code?',
    answer:
      'Activation codes are issued by your university. If you have not received one, contact the registrar’s office. Each code works once and expires.',
  },
  {
    question: 'I forgot my password. What do I do?',
    answer:
      'Ask the registrar’s office for a new activation code, then activate your account again and choose a new password.',
  },
  {
    question: 'Can I see my results here?',
    answer:
      'Not yet. Semester results are planned for a later release and will appear in your portal when they are available.',
  },
  {
    question: 'Who can see my documents?',
    answer:
      'Only you, and authorised university staff. Documents appear in your portal once the university publishes them to you.',
  },
  {
    question: 'Some of my details are wrong. How do I fix them?',
    answer:
      'Open your profile and submit a correction request. University staff review it, and your record is updated only after it is approved.',
  },
  {
    question: 'How do I apply for a re-exam?',
    answer:
      'Go to Examinations in your portal. When re-exam applications are open, you can apply there and then follow the payment steps for your region.',
  },
];
