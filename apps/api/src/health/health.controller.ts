import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type HealthResponse, healthResponseSchema } from '@docversity/validation';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Infrastructure health',
    description:
      'Performs live connectivity checks against PostgreSQL (SELECT 1), Redis (PING) and object ' +
      'storage (HeadBucket). Returns 200 only when every dependency is healthy.',
  })
  @ApiOkResponse({
    description: 'All dependencies are healthy.',
    standardSchema: healthResponseSchema,
  })
  @ApiServiceUnavailableResponse({
    description: 'At least one dependency failed its check. The body identifies which.',
    standardSchema: healthResponseSchema,
  })
  async getHealth(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }
}
