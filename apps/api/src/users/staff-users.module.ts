import { Module } from '@nestjs/common';
import { StaffUsersController } from './staff-users.controller.js';
import { StaffUsersService } from './staff-users.service.js';

/** SUPER_ADMIN staff-account administration (MFA/password resets, disabling accounts). */
@Module({ controllers: [StaffUsersController], providers: [StaffUsersService] })
export class StaffUsersModule {}
