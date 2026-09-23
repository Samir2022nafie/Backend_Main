import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import {
  eventQuerySchema,
  EventQueryDto,
} from './dto';

@Controller('admin/communities/:slug/pending-events')
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async listPendingEvents(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(eventQuerySchema)) query: EventQueryDto,
  ) {
    return this.eventsService.listPendingEvents(slug, user.id, query);
  }
}
