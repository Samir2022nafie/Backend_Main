import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { NotificationQueryDto } from './dto';
import { ErrorCode } from '@/core/common/enums';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check and deliver notifications for events and hangouts that have reached their start time
   */
  async checkStartingEventsAndHangouts(userId: string) {
    try {
      const now = new Date();
      const pastWindow = new Date(Date.now() - 48 * 60 * 60 * 1000); // past 48 hours

      // 1. Events user is participating in or hosting that have reached start time
      const startingEvents = await this.prisma.events.findMany({
        where: {
          deleted_at: null,
          starts_at: {
            lte: now,
            gte: pastWindow,
          },
          OR: [
            { creator_id: userId },
            { participants: { some: { user_id: userId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          starts_at: true,
        },
      });

      for (const ev of startingEvents) {
        const existing = await this.prisma.notifications.findFirst({
          where: {
            user_id: userId,
            related_entity_type: 'event',
            related_entity_id: ev.id,
            type: 'event_reminder',
          },
        });

        if (!existing) {
          await this.prisma.notifications.create({
            data: {
              user_id: userId,
              type: 'event_reminder',
              title: 'Event Started',
              message: `Event "${ev.title}" has started!`,
              related_entity_type: 'event',
              related_entity_id: ev.id,
            },
          }).catch(() => null);
        }
      }

      // 2. Hangouts user is participating in or hosting that have reached start time
      const startingHangouts = await this.prisma.hangouts.findMany({
        where: {
          deleted_at: null,
          starts_at: {
            lte: now,
            gte: pastWindow,
          },
          OR: [
            { creator_id: userId },
            { participants: { some: { user_id: userId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          starts_at: true,
        },
      });

      for (const h of startingHangouts) {
        const existing = await this.prisma.notifications.findFirst({
          where: {
            user_id: userId,
            related_entity_type: 'hangout',
            related_entity_id: h.id,
            type: 'event_reminder',
          },
        });

        if (!existing) {
          await this.prisma.notifications.create({
            data: {
              user_id: userId,
              type: 'event_reminder',
              title: 'Hangout Started',
              message: `Hangout "${h.title}" is starting now!`,
              related_entity_type: 'hangout',
              related_entity_id: h.id,
            },
          }).catch(() => null);
        }
      }
    } catch {
      // Non-blocking
    }
  }

  async getUnreadCount(userId: string) {
    await this.checkStartingEventsAndHangouts(userId);

    const count = await this.prisma.notifications.count({
      where: {
        user_id: userId,
        is_read: false,
      },
    });

    return {
      count,
      hasUnread: count > 0,
    };
  }

  async listNotifications(userId: string, query: NotificationQueryDto) {
    await this.checkStartingEventsAndHangouts(userId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      user_id: userId,
    };

    if (query.unreadOnly) {
      where.is_read = false;
    }

    const [total, items] = await Promise.all([
      this.prisma.notifications.count({ where }),
      this.prisma.notifications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const formatted = items.map((n) => ({
      id: n.id,
      userId: n.user_id,
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      relatedEntityType: n.related_entity_type,
      related_entity_type: n.related_entity_type,
      relatedEntityId: n.related_entity_id,
      related_entity_id: n.related_entity_id,
      isRead: n.is_read,
      is_read: n.is_read,
      createdAt: n.created_at,
      created_at: n.created_at,
    }));

    return {
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Notification not found',
      });
    }

    const updated = await this.prisma.notifications.update({
      where: { id },
      data: { is_read: true },
    });

    return {
      ...updated,
      isRead: updated.is_read,
    };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });

    return { success: true };
  }

  async clearAll(userId: string) {
    await this.prisma.notifications.deleteMany({
      where: { user_id: userId },
    });

    return { success: true };
  }

  async deleteNotification(id: string, userId: string) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Notification not found',
      });
    }

    await this.prisma.notifications.delete({
      where: { id },
    });

    return { success: true };
  }
}
