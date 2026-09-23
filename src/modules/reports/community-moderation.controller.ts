import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { paginationSchema, PaginationDto } from '@/core/utils/zod-utils';
import { reportQuerySchema, ReportQueryDto } from './dto';

@Controller()
export class CommunityModerationController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('communities/:slug/reports')
  async listCommunityReports(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQueryDto,
  ) {
    return this.reportsService.listCommunityReports(slug, user.id, query);
  }

  @Get('communities/:slug/moderation-actions')
  async listCommunityModerationActions(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationDto,
  ) {
    return this.reportsService.listCommunityModerationActions(slug, user.id, query);
  }

  @Get('admin/communities/:slug/banned-users')
  async listCommunityBannedUsers(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.reportsService.listCommunityBannedUsers(slug, user.id);
  }
}
