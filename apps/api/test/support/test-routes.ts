import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { PERMISSIONS } from '@docversity/types';
import { RequirePermissions } from '../../src/auth/auth.decorators.js';
import { PrismaService } from '../../src/database/prisma.service.js';

/**
 * TEST-ONLY routes (never part of the application). They exercise the permission framework and
 * the database-error mapping before real feature controllers exist.
 */
@Controller('test-only')
class TestOnlyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('students')
  @RequirePermissions(PERMISSIONS.studentsRead)
  readStudents() {
    return { ok: true };
  }

  @Post('students')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.studentsWrite)
  writeStudents() {
    return { ok: true };
  }

  @Post('certificates/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesApprove)
  approveCertificate() {
    return { ok: true };
  }

  @Post('users')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.usersManage, PERMISSIONS.settingsManage)
  manageUsers() {
    return { ok: true };
  }

  /** Attempts to modify the append-only audit log → the DV001 trigger rejects it. */
  @Post('tamper-audit')
  @HttpCode(200)
  async tamperAudit() {
    const entry = await this.prisma.client.auditLog.create({
      data: { action: 'TEST_ENTRY', entityType: 'Test' },
    });
    await this.prisma.client.auditLog.update({
      where: { id: entry.id },
      data: { action: 'TAMPERED' },
    });
    return { ok: true };
  }

  @Post('boom')
  @HttpCode(200)
  boom() {
    throw new Error('internal detail: SELECT * FROM secret_table');
  }
}

@Module({ controllers: [TestOnlyController] })
export class TestRoutesModule {}
