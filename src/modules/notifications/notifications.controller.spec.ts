import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockNotificationsService = {
    listNotifications: jest.fn().mockResolvedValue({
      data: [{ id: 'n1', title: 'Welcome' }],
      meta: { total: 1 },
    }),
    markAsRead: jest.fn().mockResolvedValue({
      id: 'n1',
      is_read: true,
    }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list notifications', async () => {
    const res = await controller.list(user, { page: 1, limit: 10, unreadOnly: true });

    expect(mockNotificationsService.listNotifications).toHaveBeenCalledWith('user-1', {
      page: 1,
      limit: 10,
      unreadOnly: true,
    });
    expect(res.data).toHaveLength(1);
  });

  it('should mark notification read', async () => {
    const res = await controller.markRead('n1', user);

    expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith('n1', 'user-1');
    expect(res.is_read).toBe(true);
  });
});
