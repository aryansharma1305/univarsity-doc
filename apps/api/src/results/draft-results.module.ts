import { ResultReviewController } from './result-review.controller.js';
import { ResultReviewService } from './result-review.service.js';
import { Module } from '@nestjs/common';
import { ResultImportsModule } from '../result-imports/result-imports.module.js';
import { DraftResultsService } from './draft-results.service.js';
import { DraftResultsController } from './draft-results.controller.js';
@Module({
  imports: [ResultImportsModule],
  controllers: [DraftResultsController, ResultReviewController],
  providers: [DraftResultsService, ResultReviewService],
})
export class DraftResultsModule {}
