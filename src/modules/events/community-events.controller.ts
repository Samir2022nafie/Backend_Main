import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  createEventSchema,
  CreateEventDto,
  updateEventSchema,
  UpdateEventDto,
  eventQuerySchema,
  EventQueryDto,
  banEventUserSchema,
  BanEventUserDto,
  rejectEventSchema,
  RejectEventDto,
} from './dto';

@Controller('communities/:slug/events')
export class CommunityEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createEventSchema)) dto: CreateEventDto,
  ) {
    return this.eventsService.create(slug, user.id, dto);
  }

  @Public()
  @Get()
  async findAll(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(eventQuerySchema)) query: EventQueryDto,
    @CurrentUser() user?: any,
  ) {
    return this.eventsService.findAll(slug, query, user?.id);
  }

  @Public()
  @Get(':id')
  async findOne(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.eventsService.findOne(slug, id, user?.id);
  }

  @Patch(':id')
  async update(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateEventSchema)) dto: UpdateEventDto,
  ) {
    return this.eventsService.update(slug, id, user.id, dto);
  }

  @Delete(':id')
  async softDelete(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.softDelete(slug, id, user.id);
  }

  @Post(':id/join')
  async join(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.join(slug, id, user.id);
  }

  @Post(':id/leave')
  async leave(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.leave(slug, id, user.id);
  }

  @Post(':id/approve')
  async approve(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.approve(slug, id, user.id);
  }

  @Post(':id/reject')
  async reject(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(rejectEventSchema)) dto: RejectEventDto,
  ) {
    return this.eventsService.reject(slug, id, user.id, dto);
  }

  @Post(':id/ban')
  async banUser(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(banEventUserSchema)) dto: BanEventUserDto,
  ) {
    return this.eventsService.banUser(slug, id, user.id, dto);
  }

  @Post(':id/save')
  async toggleSave(
    @Param('slug') slug: string,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.toggleSave(slug, id, user.id);
  }
}
