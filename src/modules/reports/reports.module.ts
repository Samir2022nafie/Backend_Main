import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CommunityModerationController } from './community-moderation.controller';

@Module({
  controllers: [ReportsController, CommunityModerationController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
