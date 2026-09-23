import { Controller, Get, Param } from '@nestjs/common';
import { EventsService } from './events.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get(':id')
  async findById(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.eventsService.findById(id, user?.id);
  }
}
