import { Module } from '@nestjs/common';
import { StudentAccountsController } from './student-accounts.controller.js';
import { StudentAccountsService } from './student-accounts.service.js';

/** Phase 6: staff administration of student portal accounts and activation codes. */
@Module({
  controllers: [StudentAccountsController],
  providers: [StudentAccountsService],
})
export class StudentAccountsModule {}
