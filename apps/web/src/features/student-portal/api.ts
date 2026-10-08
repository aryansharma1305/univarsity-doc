import {
  okResponseSchema,
  studentMeSchema,
  type StudentActivateInput,
} from '@docversity/validation';
import { resetApiClient, studentRequest } from '@/lib/api';

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
};
