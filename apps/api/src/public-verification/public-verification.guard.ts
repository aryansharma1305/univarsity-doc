import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { verificationUnavailable } from './public-verification.service.js';

@Injectable()
export class PublicVerificationGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    // Shared across services; runs before validation so invalid bodies cannot bypass the budget.
    let limit;
    try {
      limit = await this.limiter.hit(
        'public-verification-v1',
        [
          { key: this.hasher.hash('public-verification:client', req.ip ?? 'unknown'), limit: 20 },
          { key: 'global', limit: 600 },
        ],
        60,
      );
    } catch {
      throw verificationUnavailable();
    }
    if (limit.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'PUBLIC_VERIFICATION_RATE_LIMITED',
        'Too many requests. Please wait before trying again.',
        { headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    if (!req.is('application/json'))
      throw Errors.validation([{ path: 'request', message: 'Send a JSON request.' }]);
    return true;
  }
}
