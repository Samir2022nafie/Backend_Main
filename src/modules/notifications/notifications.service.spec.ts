import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '@/core/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrismaService = {
    notifications: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const notifId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listNotifications', () => {
    it('should return paginated list of user notifications', async () => {
      mockPrismaService.notifications.count.mockResolvedValueOnce(1);
      mockPrismaService.notifications.findMany.mockResolvedValueOnce([
        { id: notifId, user_id: userId, title: 'Welcome', is_read: false },
      ]);

      const result = await service.listNotifications(userId, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.notifications.findMany).toHaveBeenCalledWith({
        where: { user_id: userId },
        skip: 0,
        take: 10,
        orderBy: { created_at: 'desc' },
      });
    });

    it('should filter unread notifications when unreadOnly is true', async () => {
      mockPrismaService.notifications.count.mockResolvedValueOnce(0);
      mockPrismaService.notifications.findMany.mockResolvedValueOnce([]);

      await service.listNotifications(userId, { page: 1, limit: 10, unreadOnly: true });

      expect(mockPrismaService.notifications.findMany).toHaveBeenCalledWith({
        where: { user_id: userId, is_read: false },
        skip: 0,
        take: 10,
        orderBy: { created_at: 'desc' },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockPrismaService.notifications.findFirst.mockResolvedValueOnce({
        id: notifId,
        user_id: userId,
        is_read: false,
      });
      mockPrismaService.notifications.update.mockResolvedValueOnce({
        id: notifId,
        user_id: userId,
        is_read: true,
      });

      const result = await service.markAsRead(notifId, userId);

      expect(result.is_read).toBe(true);
      expect(mockPrismaService.notifications.update).toHaveBeenCalledWith({
        where: { id: notifId },
        data: { is_read: true },
      });
    });

    it('should throw NotFoundException if notification does not exist or belongs to another user', async () => {
      mockPrismaService.notifications.findFirst.mockResolvedValueOnce(null);

      await expect(service.markAsRead(notifId, userId)).rejects.toThrow(NotFoundException);
    });
  });
});
