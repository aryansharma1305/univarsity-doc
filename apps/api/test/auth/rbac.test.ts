import type { INestApplication } from '@nestjs/common';
import type { RoleName } from '@docversity/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRoutesModule } from '../support/test-routes.js';
import {
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  http,
  realConfig,
  signIn,
} from '../helpers.js';

let app: INestApplication;
beforeAll(async () => {
  app = await createTestApp(realConfig(), { extraModules: [TestRoutesModule] });
});
afterAll(async () => {
  await app.close();
});

async function as(roles: RoleName[]) {
  const user = await createTestUser({ roles });
  const agent = browser(app);
  const csrf = await signIn(agent, user);
  return {
    get: (path: string) => agent.get(`/api/v1/test-only/${path}`),
    post: (path: string) => agent.post(`/api/v1/test-only/${path}`).set('X-CSRF-Token', csrf),
  };
}

describe('permission guard', () => {
  it('requires authentication before authorization', async () => {
    const response = await http(app).get('/api/v1/test-only/students');
    expect(response.status).toBe(401);
  });

  it('keeps VIEWER read-only', async () => {
    const viewer = await as(['VIEWER']);
    await viewer.get('students').expect(200);
    const denied = await viewer.post('students');
    expect(denied.status).toBe(403);
    expect(errorOf(denied).code).toBe('FORBIDDEN');
    await viewer.post('certificates/approve').expect(403);
  });

  it('grants SUPER_ADMIN everything, including routes needing several permissions', async () => {
    const admin = await as(['SUPER_ADMIN']);
    await admin.get('students').expect(200);
    await admin.post('students').expect(200);
    await admin.post('certificates/approve').expect(200);
    await admin.post('users').expect(200);
  });

  it('lets APPROVER approve but not write student records', async () => {
    const approver = await as(['APPROVER']);
    await approver.post('certificates/approve').expect(200);
    await approver.post('students').expect(403);
  });

  it('lets REGISTRAR write student records but not approve or manage users', async () => {
    const registrar = await as(['REGISTRAR']);
    await registrar.post('students').expect(200);
    await registrar.post('certificates/approve').expect(403);
    await registrar.post('users').expect(403);
  });

  it('grants nothing to a user without roles', async () => {
    const nobody = await as([]);
    await nobody.get('students').expect(403);
  });
});
