import { Global, Module } from '@nestjs/common';
import { StudentAuthController, StudentController } from './student-auth.controller.js';
import { StudentAuthGuard } from './student-auth.guard.js';
import { StudentAuthService } from './student-auth.service.js';
import { StudentSessionStore } from './student-session.store.js';

/** Phase 6: the student portal authentication boundary. */
@Global()
@Module({
  controllers: [StudentAuthController, StudentController],
  providers: [StudentAuthService, StudentSessionStore, StudentAuthGuard],
  exports: [StudentSessionStore, StudentAuthGuard],
})
export class StudentAuthModule {}
