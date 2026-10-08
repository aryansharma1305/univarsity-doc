import {
  okResponseSchema,
  studentMeSchema,
  type ProfileChangesInput,
  studentProfileRequestSchema,
  type StudentActivateInput,
} from '@docversity/validation';
import { apiUpload, resetApiClient, studentRequest } from '@/lib/api';

/** Student portal requests — always with the STUDENT session and CSRF token. */
export const studentPortalApi = {
  activate: async (body: StudentActivateInput) => {
    const me = await studentRequest('POST', 'student-auth/activate', studentMeSchema, { body });
    resetApiClient();
    return me;
  },
  login: async (body: { registrationNumber: string; password: string }) => {
    const me = await studentRequest('POST', 'student-auth/login', studentMeSchema, { body });
    resetApiClient();
    return me;
  },
  logout: async () => {
    await studentRequest('POST', 'student-auth/logout', okResponseSchema);
    resetApiClient();
  },
  /** Profile change request: proposed fields, optional note and photo (validated server-side). */
  submitProfileRequest: (input: { changes: ProfileChangesInput; note?: string; photo?: File }) => {
    const form = new FormData();
    form.set('changes', JSON.stringify(input.changes));
    if (input.note) form.set('note', input.note);
    if (input.photo) form.set('photo', input.photo);
    return apiUpload('student/profile-requests', form, studentProfileRequestSchema, {
      principal: 'student',
    });
  },
  cancelProfileRequest: (id: string) =>
    studentRequest('POST', `student/profile-requests/${id}/cancel`, studentProfileRequestSchema),
};
