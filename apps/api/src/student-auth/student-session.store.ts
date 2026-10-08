import { Injectable } from '@nestjs/common';
import { SessionStore } from '../auth/session.store.js';

/**
 * Student portal sessions: the same hardened mechanism as staff sessions (random 256-bit ID, only
 * its SHA-256 in Redis, idle + absolute expiry, fail-closed), in a SEPARATE key namespace —
 * `<prefix>student-session:*` — so a student session can never be looked up as a staff session.
 * `userId` in the record holds the student ACCOUNT id.
 */
@Injectable()
export class StudentSessionStore extends SessionStore {
  protected override readonly keys = { session: 'student-session', index: 'student-sessions' };
}
