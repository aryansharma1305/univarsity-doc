import type { Metadata } from 'next';
import { PaymentDestinationsView } from '@/features/re-exam-payments/destinations-view';

export const metadata: Metadata = { title: 'Re-exam payment settings' };

export default function ReExamPaymentSettingsPage() {
  return <PaymentDestinationsView />;
}
