import { Global, Module } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { IdentifierHasher } from './identifier-hasher.js';
import {
  PASSWORD_RESET_NOTIFIER,
  UnconfiguredPasswordResetNotifier,
} from './password-reset.notifier.js';
import { PasswordResetStore } from './password-reset.store.js';
import { PasswordService } from './password.service.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionStore } from './session.store.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CsrfService,
    IdentifierHasher,
    PasswordResetStore,
    { provide: PasswordService, useValue: new PasswordService() },
    RateLimiter,
    SessionStore,
    UsersService,
    { provide: PASSWORD_RESET_NOTIFIER, useClass: UnconfiguredPasswordResetNotifier },
  ],
  exports: [
    CsrfService,
    SessionStore,
    UsersService,
    PasswordService,
    IdentifierHasher,
    RateLimiter,
  ],
})
export class AuthModule {}
