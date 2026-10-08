import { z } from 'zod';
import {
  atLeastOneField,
  codeSchema,
  listQuerySchema,
  masterDataStatusSchema,
  nameSchema,
  optionalFilter,
  paginatedSchema,
} from './common.js';

export const departmentSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    status: masterDataStatusSchema,
    programCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Department' });

export const departmentListSchema = paginatedSchema(departmentSchema).meta({
  id: 'DepartmentList',
});

export const createDepartmentSchema = z
  .object({ code: codeSchema, name: nameSchema, status: masterDataStatusSchema.default('ACTIVE') })
  .strict()
  .meta({ id: 'CreateDepartment' });

export const updateDepartmentSchema = atLeastOneField(
  z
    .object({
      code: codeSchema.optional(),
      name: nameSchema.optional(),
      status: masterDataStatusSchema.optional(),
    })
    .strict(),
).meta({ id: 'UpdateDepartment' });

export const DEPARTMENT_SORT_FIELDS = ['code', 'name', 'status', 'updatedAt'] as const;
export const departmentQuerySchema = listQuerySchema(DEPARTMENT_SORT_FIELDS, 'code', {
  status: optionalFilter(masterDataStatusSchema),
});

export type Department = z.infer<typeof departmentSchema>;
export type DepartmentList = z.infer<typeof departmentListSchema>;
export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export type CreateDepartment = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartment = z.infer<typeof updateDepartmentSchema>;
export type DepartmentQuery = z.infer<typeof departmentQuerySchema>;
