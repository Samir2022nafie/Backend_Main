import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  createReportSchema,
  CreateReportDto,
  updateReportStatusSchema,
  UpdateReportStatusDto,
  takeModerationActionSchema,
  TakeModerationActionDto,
  reportQuerySchema,
  ReportQueryDto,
} from './dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto,
  ) {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQueryDto,
  ) {
    return this.reportsService.listReports(user.id, query);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateReportStatusSchema)) dto: UpdateReportStatusDto,
  ) {
    return this.reportsService.updateReportStatus(id, user.id, dto);
  }

  @Post(':id/action')
  async takeAction(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(takeModerationActionSchema)) dto: TakeModerationActionDto,
  ) {
    return this.reportsService.takeAction(id, user.id, dto);
  }
}
