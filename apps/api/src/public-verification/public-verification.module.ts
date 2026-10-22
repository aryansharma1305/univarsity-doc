import { Module } from '@nestjs/common';
import { PublicVerificationController } from './public-verification.controller.js';
import { PublicVerificationGuard } from './public-verification.guard.js';
import { PublicVerificationServiceHandler } from './public-verification.service.js';
@Module({
  controllers: [PublicVerificationController],
  providers: [PublicVerificationGuard, PublicVerificationServiceHandler],
})
export class PublicVerificationModule {}
