import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { NotificationQueryDto } from './dto';
import { ErrorCode } from '@/core/common/enums';

@Injectable()
export class NotificationsService {
  private lastClearedTimestamps = new Map<string, number>();
  private userPreferencesMap = new Map<string, { global: any; specific: Record<string, any> }>();

  constructor(private readonly prisma: PrismaService) {}

  getUserPreferences(userId: string) {
    if (!this.userPreferencesMap.has(userId)) {
      this.userPreferencesMap.set(userId, {
        global: {
          event_reminder_enabled: true,
          event_remind_days: 0,
          event_remind_hours: 6,
          hangout_reminder_enabled: true,
          hangout_remind_days: 0,
          hangout_remind_hours: 6,
        },
        specific: {},
      });
    }
    return this.userPreferencesMap.get(userId)!;
  }

  getPreferences(userId: string) {
    return this.getUserPreferences(userId);
  }

  updatePreferences(userId: string, update: any) {
    const current = this.getUserPreferences(userId);
    if (update.global) {
      current.global = { ...current.global, ...update.global };
    }
    if (update.specific) {
      current.specific = { ...current.specific, ...update.specific };
    }
    if (update.entityId && update.settings) {
      current.specific[update.entityId] = {
        ...(current.specific[update.entityId] || {}),
        ...update.settings,
      };
    }
    this.userPreferencesMap.set(userId, current);
    return current;
  }

  /**
   * Check and deliver notifications for events and hangouts (starting, reminder, ended)
   */
  async checkStartingEventsAndHangouts(userId: string) {
    try {
      const lastCleared = this.lastClearedTimestamps.get(userId) || 0;
      const now = new Date();
      // If user cleared notifications, do not recreate starting notifications for events that started before the clear action.
      // But events that start AFTER lastCleared will still trigger cleanly!
      const pastWindow = new Date(
        lastCleared > 0
          ? Math.max(Date.now() - 48 * 60 * 60 * 1000, lastCleared)
          : Date.now() - 48 * 60 * 60 * 1000
      );
      const in6Hours = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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

      // Clean up any stale legacy notifications containing 'in less than 6 hours'
      await this.prisma.notifications.deleteMany({
        where: {
          user_id: userId,
          message: { contains: 'in less than 6 hours' },
        },
      }).catch(() => null);

      const userPrefs = this.getUserPreferences(userId);

      // Helper to compute human-readable reminder string
      const getReminderTimeStr = (days: number, hours: number) => {
        if (days > 0 && hours > 0) {
          return `in ${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours > 1 ? 's' : ''}`;
        }
        if (days > 0) {
          return `in ${days} day${days > 1 ? 's' : ''}`;
        }
        if (hours > 0) {
          return `in ${hours} hour${hours > 1 ? 's' : ''}`;
        }
        return 'now';
      };

      // 2. Events starting soon based on user's exact reminder setting
      if (userPrefs.global.event_reminder_enabled !== false) {
        const upcomingEvents = await this.prisma.events.findMany({
          where: {
            deleted_at: null,
            starts_at: {
              gte: now,
            },
            OR: [
              { creator_id: userId },
              { participants: { some: { user_id: userId } } },
            ],
          },
          select: { id: true, title: true, starts_at: true },
        });

        for (const ev of upcomingEvents) {
          const spec = userPrefs.specific[ev.id];
          if (spec && (spec.muted || spec.receive_notifications === false || spec.reminder_enabled === false)) {
            continue;
          }
          const days = spec?.remind_days ?? userPrefs.global.event_remind_days ?? 0;
          const hours = spec?.remind_hours ?? userPrefs.global.event_remind_hours ?? 6;
          const offsetMs = (days * 24 + hours) * 60 * 60 * 1000;
          const evStartTime = new Date(ev.starts_at).getTime();
          const triggerTime = evStartTime - offsetMs;

          if (now.getTime() >= triggerTime && now.getTime() < evStartTime) {
            const timeStr = getReminderTimeStr(days, hours);
            const existing = await this.prisma.notifications.findFirst({
              where: {
                user_id: userId,
                related_entity_type: 'event',
                related_entity_id: ev.id,
                type: 'event_reminder',
                title: 'Event Starting Soon',
              },
            });
            if (!existing) {
              await this.prisma.notifications.create({
                data: {
                  user_id: userId,
                  type: 'event_reminder',
                  title: 'Event Starting Soon',
                  message: `Event "${ev.title}" starts ${timeStr}!`,
                  related_entity_type: 'event',
                  related_entity_id: ev.id,
                },
              }).catch(() => null);
            }
          }
        }
      }

      // 3. Hangouts user is participating in or hosting that have reached start time
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

      // 4. Hangouts starting soon based on user's exact reminder setting
      if (userPrefs.global.hangout_reminder_enabled !== false) {
        const upcomingHangouts = await this.prisma.hangouts.findMany({
          where: {
            deleted_at: null,
            starts_at: {
              gte: now,
            },
            OR: [
              { creator_id: userId },
              { participants: { some: { user_id: userId } } },
            ],
          },
          select: { id: true, title: true, starts_at: true },
        });

        for (const h of upcomingHangouts) {
          const spec = userPrefs.specific[h.id];
          if (spec && (spec.muted || spec.receive_notifications === false || spec.reminder_enabled === false)) {
            continue;
          }
          const days = spec?.remind_days ?? userPrefs.global.hangout_remind_days ?? 0;
          const hours = spec?.remind_hours ?? userPrefs.global.hangout_remind_hours ?? 6;
          const offsetMs = (days * 24 + hours) * 60 * 60 * 1000;
          const hStartTime = new Date(h.starts_at).getTime();
          const triggerTime = hStartTime - offsetMs;

          if (now.getTime() >= triggerTime && now.getTime() < hStartTime) {
            const timeStr = getReminderTimeStr(days, hours);
            const existing = await this.prisma.notifications.findFirst({
              where: {
                user_id: userId,
                related_entity_type: 'hangout',
                related_entity_id: h.id,
                type: 'event_reminder',
                title: 'Hangout Starting Soon',
              },
            });
            if (!existing) {
              await this.prisma.notifications.create({
                data: {
                  user_id: userId,
                  type: 'event_reminder',
                  title: 'Hangout Starting Soon',
                  message: `Hangout "${h.title}" starts ${timeStr}!`,
                  related_entity_type: 'hangout',
                  related_entity_id: h.id,
                },
              }).catch(() => null);
            }
          }
        }
      }

      // 5. Hangouts ended
      const endedHangouts = await this.prisma.hangouts.findMany({
        where: {
          deleted_at: null,
          ends_at: {
            lte: now,
            gte: pastWindow,
          },
          OR: [
            { creator_id: userId },
            { participants: { some: { user_id: userId } } },
          ],
        },
        select: { id: true, title: true, ends_at: true },
      });

      for (const h of endedHangouts) {
        const existing = await this.prisma.notifications.findFirst({
          where: {
            user_id: userId,
            related_entity_type: 'hangout',
            related_entity_id: h.id,
            type: 'hangout_ended' as any,
          },
        });
        if (!existing) {
          await this.prisma.notifications.create({
            data: {
              user_id: userId,
              type: 'hangout_ended' as any,
              title: 'Hangout Ended',
              message: `Hangout "${h.title}" has ended`,
              related_entity_type: 'hangout',
              related_entity_id: h.id,
            },
          }).catch(() => null);
        }
      }

      // 6. Events ended (with multi-day message format if applicable)
      const endedEvents = await this.prisma.events.findMany({
        where: {
          deleted_at: null,
          ends_at: {
            lte: now,
            gte: pastWindow,
          },
          OR: [
            { creator_id: userId },
            { participants: { some: { user_id: userId } } },
          ],
        },
        select: { id: true, title: true, starts_at: true, ends_at: true },
      });

      for (const ev of endedEvents) {
        const existing = await this.prisma.notifications.findFirst({
          where: {
            user_id: userId,
            related_entity_type: 'event',
            related_entity_id: ev.id,
            type: 'event_ended' as any,
          },
        });
        if (!existing) {
          const startDate = new Date(ev.starts_at);
          const endDate = ev.ends_at ? new Date(ev.ends_at) : null;
          let msg = `Event "${ev.title}" has ended`;
          if (endDate && startDate.toDateString() !== endDate.toDateString()) {
            const nextDateStr = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            const nextTimeStr = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            msg = `event ended for the day next start date is ${nextDateStr} at ${nextTimeStr}`;
          }

          await this.prisma.notifications.create({
            data: {
              user_id: userId,
              type: 'event_ended' as any,
              title: 'Event Ended',
              message: msg,
              related_entity_type: 'event',
              related_entity_id: ev.id,
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
    this.lastClearedTimestamps.set(userId, Date.now());
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    }).catch(() => null);

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
