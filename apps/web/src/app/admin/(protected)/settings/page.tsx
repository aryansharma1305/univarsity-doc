import { redirect } from 'next/navigation';

/** Settings currently consist of the re-exam payment settings only. */
export default function SettingsPage() {
  redirect('/admin/settings/re-exam-payments');
}
