import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * One structured line per request: method, path (WITHOUT query string, which can carry tokens),
 * status and duration. Never headers, cookies or bodies. The request ID is added by the logger.
 */
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    logger.log({
      msg: 'request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
    });
  });
  next();
}
