import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ERROR_CODES, PROFILE_PHOTO_RULES } from '@docversity/validation';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError, Errors } from '../common/app-error.js';

export interface UploadedPhoto {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type PhotoUploadRequest = Request & { file?: UploadedPhoto };

const MAX_MB = PROFILE_PHOTO_RULES.maxBytes / (1024 * 1024);

/**
 * Reads a profile-request submission: text fields `changes` (JSON) and `note`, and at most ONE
 * optional file in `photo`, into memory with hard limits. Interceptors run after the global guards,
 * so the student session and CSRF token are verified before any byte of the upload is buffered.
 */
@Injectable()
export class PhotoUploadInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: PROFILE_PHOTO_RULES.maxBytes,
      files: 1,
      fields: 2,
      parts: 3,
      fieldSize: 8_192,
      headerPairs: 50,
    },
  }).single('photo');

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<PhotoUploadRequest>();
    const response = http.getResponse<Response>();
    if (!request.is('multipart/form-data')) {
      throw Errors.validation([
        { path: 'photo', message: 'Send the request as multipart/form-data.' },
      ]);
    }
    await new Promise<void>((resolve, reject) => {
      this.upload(request, response, (error: unknown) => {
        if (!error) {
          resolve();
          return;
        }
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          reject(
            new AppError(
              HttpStatus.PAYLOAD_TOO_LARGE,
              ERROR_CODES.fileTooLarge,
              `The photo is larger than ${MAX_MB} MB.`,
              { details: [{ path: 'photo', message: `Maximum size is ${MAX_MB} MB.` }] },
            ),
          );
          return;
        }
        reject(
          Errors.validation([
            { path: 'photo', message: 'Upload at most one photo in the "photo" field.' },
          ]),
        );
      });
    });
    return next.handle();
  }
}
