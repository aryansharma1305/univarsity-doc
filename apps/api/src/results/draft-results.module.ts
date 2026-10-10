import { Module } from '@nestjs/common';
import { ResultImportsModule } from '../result-imports/result-imports.module.js';
import { DraftResultsService } from './draft-results.service.js';
import { DraftResultsController } from './draft-results.controller.js';
@Module({
  imports: [ResultImportsModule],
  controllers: [DraftResultsController],
  providers: [DraftResultsService],
})
export class DraftResultsModule {}
