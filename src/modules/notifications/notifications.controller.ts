import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import { notificationQuerySchema, NotificationQueryDto } from './dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQueryDto,
  ) {
    return this.notificationsService.listNotifications(user.id, query);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Delete('clear-all')
  async clearAll(@CurrentUser() user: any) {
    return this.notificationsService.clearAll(user.id);
  }

  @Delete(':id')
  async deleteNotification(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.deleteNotification(id, user.id);
  }
}
