import { Module } from '@nestjs/common';
import {
  AcademicSessionsController,
  DashboardController,
  DepartmentsController,
  ProgramsController,
  RegistrationsController,
  StudentsController,
} from './academic.controllers.js';
import {
  CurriculaController,
  ProgramCurriculaController,
  StudentCurriculumController,
  SubjectsController,
} from './curricula.controllers.js';
import { CurriculaService } from './curricula.service.js';
import { SubjectsService } from './subjects.service.js';
import { AcademicSessionsService } from './academic-sessions.service.js';
import { DashboardService } from './dashboard.service.js';
import { DepartmentsService } from './departments.service.js';
import { ProgramsService } from './programs.service.js';
import { RegistrationsService } from './registrations.service.js';
import { StudentsService } from './students.service.js';

/**
 * Phase 4: academic masters (departments, programs, sessions), students and registrations.
 * Phase 7B: subject catalogue, curriculum versions and registration ↔ curriculum assignment.
 */
@Module({
  controllers: [
    DashboardController,
    DepartmentsController,
    ProgramsController,
    AcademicSessionsController,
    StudentsController,
    RegistrationsController,
    SubjectsController,
    ProgramCurriculaController,
    CurriculaController,
    StudentCurriculumController,
  ],
  providers: [
    DashboardService,
    DepartmentsService,
    ProgramsService,
    AcademicSessionsService,
    RegistrationsService,
    StudentsService,
    SubjectsService,
    CurriculaService,
  ],
})
export class AcademicModule {}
