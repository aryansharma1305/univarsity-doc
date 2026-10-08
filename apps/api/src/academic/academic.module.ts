import { Module } from '@nestjs/common';
import {
  AcademicSessionsController,
  DashboardController,
  DepartmentsController,
  ProgramsController,
  RegistrationsController,
  StudentsController,
} from './academic.controllers.js';
import { AcademicSessionsService } from './academic-sessions.service.js';
import { DashboardService } from './dashboard.service.js';
import { DepartmentsService } from './departments.service.js';
import { ProgramsService } from './programs.service.js';
import { RegistrationsService } from './registrations.service.js';
import { StudentsService } from './students.service.js';

/** Phase 4: academic masters (departments, programs, sessions), students and registrations. */
@Module({
  controllers: [
    DashboardController,
    DepartmentsController,
    ProgramsController,
    AcademicSessionsController,
    StudentsController,
    RegistrationsController,
  ],
  providers: [
    DashboardService,
    DepartmentsService,
    ProgramsService,
    AcademicSessionsService,
    RegistrationsService,
    StudentsService,
  ],
})
export class AcademicModule {}
