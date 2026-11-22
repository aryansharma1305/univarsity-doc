import type { Metadata } from 'next';
import { StaffUsersView } from '@/features/staff-users/staff-users-view';

export const metadata: Metadata = { title: 'Staff Users & Roles' };

export default function StaffRolesPage() {
  return <StaffUsersView />;
}
