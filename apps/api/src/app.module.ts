import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AcademicModule } from './academic/academic.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';
import { GlobalExceptionFilter } from './common/http-exception.filter.js';
import type { ApiConfig } from './config/api-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ExaminationsModule } from './examinations/examinations.module.js';
import { ReExamsModule } from './re-exams/re-exams.module.js';
import { HistoricalDocumentsModule } from './historical-documents/historical-documents.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StudentAccountsModule } from './student-accounts/student-accounts.module.js';
import { StudentProfileModule } from './student-profile/student-profile.module.js';
import { StudentAuthGuard } from './student-auth/student-auth.guard.js';
import { StudentAuthModule } from './student-auth/student-auth.module.js';

@Module({})
export class AppModule {
  /** The validated configuration is passed in explicitly so tests can supply their own. */
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        StorageModule,
        QueueModule,
        AuditModule,
        AuthModule,
        AcademicModule,
        ImportsModule,
        StudentAuthModule,
        StudentAccountsModule,
        StudentProfileModule,
        HistoricalDocumentsModule,
        ExaminationsModule,
        ReExamsModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        // Order matters: authenticate (staff, then student routes) → CSRF/origin → permissions.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: StudentAuthGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    };
  }
}
