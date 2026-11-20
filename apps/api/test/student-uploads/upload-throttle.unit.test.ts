import { type CallHandler, type ExecutionContext, HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/common/app-error.js';
import type { StudentUploadsService } from '../../src/student-uploads/student-uploads.service.js';
import { UploadThrottleInterceptor } from '../../src/student-uploads/upload-throttle.interceptor.js';

const contextFor = (student: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ student }) }),
  }) as unknown as ExecutionContext;

describe('UploadThrottleInterceptor (no services)', () => {
  it('counts the upload against the account before the body is buffered', async () => {
    const throttleWrite = vi.fn().mockResolvedValue(undefined);
    const handle = vi.fn(() => of('ok'));
    const interceptor = new UploadThrottleInterceptor({
      throttleWrite,
    } as unknown as StudentUploadsService);
    await interceptor.intercept(contextFor({ accountId: 'acc-1' }), { handle } as CallHandler);
    expect(throttleWrite).toHaveBeenCalledWith('acc-1');
    expect(handle).toHaveBeenCalledOnce();
  });

  it('stops before the upload interceptor runs when the budget is spent', async () => {
    const limited = new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      'AUTH_RATE_LIMITED',
      'Too many document actions.',
    );
    const handle = vi.fn(() => of('ok'));
    const interceptor = new UploadThrottleInterceptor({
      throttleWrite: vi.fn().mockRejectedValue(limited),
    } as unknown as StudentUploadsService);
    await expect(
      interceptor.intercept(contextFor({ accountId: 'acc-1' }), { handle } as CallHandler),
    ).rejects.toBe(limited);
    expect(handle).not.toHaveBeenCalled();
  });

  it('refuses a request without a student session', async () => {
    const handle = vi.fn(() => of('ok'));
    const interceptor = new UploadThrottleInterceptor({
      throttleWrite: vi.fn(),
    } as unknown as StudentUploadsService);
    await expect(
      interceptor.intercept(contextFor(undefined), { handle } as CallHandler),
    ).rejects.toBeInstanceOf(AppError);
    expect(handle).not.toHaveBeenCalled();
  });
});
