import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  errorResponseSchema,
  okResponseSchema,
  staffAccessResetRequestSchema,
  type StaffAccessResetRequest,
  staffDisableRequestSchema,
  type StaffDisableRequest,
  type StaffUser,
  staffUserListResponseSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StaffUsersService } from './staff-users.service.js';

const errorResponse = { standardSchema: errorResponseSchema };
const userIdPipe = new ZodValidationPipe(z.uuid());

/** SUPER_ADMIN only (`users.manage`). */
@ApiTags('staff-users')
@ApiCookieAuth('session')
@Controller('staff-users')
export class StaffUsersController {
  constructor(private readonly staff: StaffUsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.usersManage)
  @ApiOperation({ summary: 'Staff accounts with their status, MFA and password-change state' })
  @ApiOkResponse({ standardSchema: staffUserListResponseSchema })
  async list(@Res({ passthrough: true }) res: Response): Promise<{ data: StaffUser[] }> {
    res.setHeader('Cache-Control', 'no-store');
    return { data: await this.staff.list() };
  }

  @Post(':userId/access-reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.usersManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: "Reset another staff member's MFA and require a new password",
    description:
      'Removes the authenticator and recovery codes, replaces the password with the required ' +
      'temporary password (the old one stops working), sets the password-change flag, clears any MFA ' +
      'lockout and revokes all of their sessions. Audited (STAFF_ACCESS_RESET). Not for your own ' +
      'account.',
  })
  @ApiBody({ schema: openApiRequestSchema(staffAccessResetRequestSchema) })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  @ApiResponse({ status: 400, description: 'Temporary password missing or weak', ...errorResponse })
  @ApiResponse({ status: 404, description: 'No such user', ...errorResponse })
  @ApiResponse({ status: 409, description: 'Own account', ...errorResponse })
  async resetAccess(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodValidationPipe(staffAccessResetRequestSchema)) body: StaffAccessResetRequest,
  ): Promise<{ ok: true }> {
    await this.staff.resetAccess(auth.user.id, userId, body);
    return { ok: true };
  }

  @Post(':userId/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.usersManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Disable (retire) a staff account and revoke its sessions',
    description:
      'Audited (USER_DISABLED). Refuses your own account and the last active SUPER_ADMIN. Used to ' +
      'retire demo accounts.',
  })
  @ApiBody({ schema: openApiRequestSchema(staffDisableRequestSchema) })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  @ApiResponse({ status: 404, description: 'No such user', ...errorResponse })
  @ApiResponse({ status: 409, description: 'Refused', ...errorResponse })
  async disable(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodValidationPipe(staffDisableRequestSchema)) body: StaffDisableRequest,
  ): Promise<{ ok: true }> {
    await this.staff.disable(auth.user.id, userId, body.reason);
    return { ok: true };
  }
}
