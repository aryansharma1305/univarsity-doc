import type { LoggerService, LogLevel } from '@nestjs/common';
import { currentRequestContext } from './request-context.js';

/** Keys whose values are never written to logs, at any depth. */
const SENSITIVE_KEY =
  /password|passwd|secret|token|cookie|authori[sz]ation|^session(_?id)?$|csrf|credential|api[-_]?key|access[-_]?key|database_?url|redis_?url/i;
export const REDACTED = '[REDACTED]';

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1),
    ]),
  );
}

export type LogSink = (line: string) => void;

/**
 * Structured JSON logger for Nest. One JSON object per line, always including the request's
 * correlation ID when there is one. Object payloads are redacted by key name.
 */
export class JsonLogger implements LoggerService {
  private enabled: Set<LogLevel>;

  constructor(
    levels: LogLevel[],
    private readonly sink: LogSink = (line) => {
      process.stdout.write(`${line}\n`);
    },
  ) {
    this.enabled = new Set(levels);
  }

  setLogLevels(levels: LogLevel[]): void {
    this.enabled = new Set(levels);
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.write('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.write('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.write('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.write('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]): void {
    this.write('fatal', message, rest);
  }

  private write(level: LogLevel, message: unknown, rest: unknown[]): void {
    if (!this.enabled.has(level)) return;
    // Nest passes the context name as the last string argument (and a stack before it for errors).
    const params = [...rest];
    const context = typeof params.at(-1) === 'string' ? (params.pop() as string) : undefined;
    const stack =
      level === 'error' && typeof params[0] === 'string' ? (params.shift() as string) : undefined;

    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
    };
    const request = currentRequestContext();
    if (request) {
      entry.requestId = request.requestId;
      if (request.userId) entry.userId = request.userId;
    }
    if (typeof message === 'object' && message !== null && !(message instanceof Error)) {
      Object.assign(entry, redact(message));
    } else if (message instanceof Error) {
      entry.msg = message.message;
      entry.err = redact(message);
    } else {
      entry.msg = String(message);
    }
    if (stack) entry.stack = stack;
    if (params.length > 0) entry.extra = redact(params);
    this.sink(JSON.stringify(entry));
  }
}
