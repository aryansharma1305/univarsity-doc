import sharp from 'sharp';
import {
  profileRequestDetailSchema,
  studentProfileRequestSchema,
  type ProfileChangesInput,
} from '@docversity/validation';
import type { browser } from '../helpers.js';
import { studentCsrf } from '../student-auth/support.js';

type Agent = ReturnType<typeof browser>;

/** Synthetic images generated in code — never real photos. */
export const images = {
  jpeg: (width = 600, height = 800) =>
    sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'SYNTHETIC-EXIF-MARKER', Artist: 'SYNTHETIC-ARTIST' } })
      .toBuffer(),
  png: (width = 400, height = 400) =>
    sharp({ create: { width, height, channels: 4, background: '#22aa6680' } })
      .png()
      .toBuffer(),
  gif: () =>
    sharp({ create: { width: 300, height: 300, channels: 3, background: '#aa3333' } })
      .gif()
      .toBuffer(),
  svg: () =>
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>',
    ),
};

export interface PhotoPart {
  bytes: Buffer;
  contentType: string;
  filename?: string;
}

/** What the tests read from a response (explicit, so helper types stay portable). */
export interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** Submits a request as the signed-in student (multipart, with the student CSRF token). */
export async function submitRequest(
  agent: Agent,
  changes: ProfileChangesInput | Record<string, unknown>,
  options: { photo?: PhotoPart; note?: string; extra?: Record<string, string> } = {},
): Promise<TestResponse> {
  const token = await studentCsrf(agent);
  let req = agent
    .post('/api/v1/student/profile-requests')
    .set('X-CSRF-Token', token)
    .field('changes', JSON.stringify(changes));
  if (options.note !== undefined) req = req.field('note', options.note);
  for (const [name, value] of Object.entries(options.extra ?? {})) req = req.field(name, value);
  if (options.photo) {
    req = req.attach('photo', options.photo.bytes, {
      filename: options.photo.filename ?? 'photo.jpg',
      contentType: options.photo.contentType,
    });
  }
  const response = await req;
  return { status: response.status, body: response.body, headers: response.headers };
}

export async function cancelRequest(agent: Agent, id: string): Promise<TestResponse> {
  const token = await studentCsrf(agent);
  const response = await agent
    .post(`/api/v1/student/profile-requests/${id}/cancel`)
    .set('X-CSRF-Token', token)
    .send();
  return { status: response.status, body: response.body, headers: response.headers };
}

export const studentRequestOf = (body: unknown) => studentProfileRequestSchema.parse(body);
export const detailOf = (body: unknown) => profileRequestDetailSchema.parse(body);
