import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { Errors } from '../common/app-error.js';
import type { StudentRequest } from '../student-auth/student-auth.decorators.js';
import { StudentUploadsService } from './student-uploads.service.js';

/**
 * Counts the upload against the student's write budget BEFORE `DocumentUploadInterceptor` buffers
 * the multipart body (list it first in `@UseInterceptors`). Guards have already resolved the student.
 */
@Injectable()
export class UploadThrottleInterceptor implements NestInterceptor {
  constructor(private readonly service: StudentUploadsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const student = context.switchToHttp().getRequest<StudentRequest>().student;
    if (!student) throw Errors.authRequired();
    await this.service.throttleWrite(student.accountId);
    return next.handle();
  }
}
