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
import { HangoutsService } from './hangouts.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  createHangoutSchema,
  CreateHangoutDto,
  updateHangoutSchema,
  UpdateHangoutDto,
  hangoutQuerySchema,
  HangoutQueryDto,
  respondHangoutRequestSchema,
  RespondHangoutRequestDto,
  banHangoutUserSchema,
  BanHangoutUserDto,
} from './dto';

@Controller('hangouts')
export class HangoutsController {
  constructor(private readonly hangoutsService: HangoutsService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createHangoutSchema)) dto: CreateHangoutDto,
  ) {
    return this.hangoutsService.create(user.id, dto);
  }

  @Public()
  @Get()
  async findAll(
    @Query(new ZodValidationPipe(hangoutQuerySchema)) query: HangoutQueryDto,
    @CurrentUser() user?: any,
  ) {
    return this.hangoutsService.findAll(query, user?.id);
  }

  @Public()
  @Get(':id')
  async findOne(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.hangoutsService.findOne(id, user?.id);
  }

  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateHangoutSchema)) dto: UpdateHangoutDto,
  ) {
    return this.hangoutsService.update(id, user.id, dto);
  }

  @Delete(':id')
  async softDelete(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.hangoutsService.softDelete(id, user.id);
  }

  @Post(':id/join')
  async join(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.hangoutsService.join(id, user.id);
  }

  @Post(':id/leave')
  async leave(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.hangoutsService.leave(id, user.id);
  }

  @Post(':id/request')
  async requestJoin(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.hangoutsService.requestJoin(id, user.id);
  }

  @Patch(':id/requests/:userId')
  async respondRequest(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('userId', new ZodValidationPipe(uuidSchema)) targetUserId: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(respondHangoutRequestSchema)) dto: RespondHangoutRequestDto,
  ) {
    return this.hangoutsService.respondRequest(id, targetUserId, user.id, dto);
  }

  @Post(':id/ban')
  async banUser(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(banHangoutUserSchema)) dto: BanHangoutUserDto,
  ) {
    return this.hangoutsService.banUser(id, user.id, dto);
  }

  @Post(':id/save')
  async toggleSave(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.hangoutsService.toggleSave(id, user.id);
  }
}
