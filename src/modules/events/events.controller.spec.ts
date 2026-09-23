import { Test, TestingModule } from '@nestjs/testing';
import { CommunityEventsController } from './community-events.controller';
import { AdminEventsController } from './admin-events.controller';
import { EventsService } from './events.service';

describe('Events Controllers', () => {
  let communityEventsController: CommunityEventsController;
  let adminEventsController: AdminEventsController;

  const mockEventsService = {
    create: jest.fn().mockResolvedValue({ id: 'e1', title: 'Event 1' }),
    findAll: jest.fn().mockResolvedValue({ data: [{ id: 'e1' }], meta: { total: 1 } }),
    findOne: jest.fn().mockResolvedValue({ id: 'e1', title: 'Event 1' }),
    update: jest.fn().mockResolvedValue({ id: 'e1', title: 'Updated' }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
    join: jest.fn().mockResolvedValue({ joined: true, participantsCount: 2 }),
    leave: jest.fn().mockResolvedValue({ joined: false, participantsCount: 1 }),
    approve: jest.fn().mockResolvedValue({ id: 'e1', approvalStatus: 'approved', isVerified: true }),
    reject: jest.fn().mockResolvedValue({ id: 'e1', approvalStatus: 'rejected', isVerified: false }),
    banUser: jest.fn().mockResolvedValue({ banned: true, userId: 'u2' }),
    toggleSave: jest.fn().mockResolvedValue({ saved: true }),
    listPendingEvents: jest.fn().mockResolvedValue({ data: [{ id: 'e1' }], meta: { total: 1 } }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityEventsController, AdminEventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    communityEventsController = module.get<CommunityEventsController>(CommunityEventsController);
    adminEventsController = module.get<AdminEventsController>(AdminEventsController);
  });

  it('should be defined', () => {
    expect(communityEventsController).toBeDefined();
    expect(adminEventsController).toBeDefined();
  });

  describe('CommunityEventsController', () => {
    it('should create event', async () => {
      const res = await communityEventsController.create('outdoor', user, {
        title: 'Event 1',
        startsAt: '2026-10-10T10:00:00.000Z',
      });
      expect(mockEventsService.create).toHaveBeenCalledWith('outdoor', 'user-1', {
        title: 'Event 1',
        startsAt: '2026-10-10T10:00:00.000Z',
      });
      expect(res.id).toBe('e1');
    });

    it('should list events', async () => {
      const res = await communityEventsController.findAll('outdoor', { page: 1, limit: 20 }, user);
      expect(mockEventsService.findAll).toHaveBeenCalledWith('outdoor', { page: 1, limit: 20 }, 'user-1');
      expect(res.data).toHaveLength(1);
    });

    it('should get single event', async () => {
      const res = await communityEventsController.findOne('outdoor', 'e1', user);
      expect(mockEventsService.findOne).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.id).toBe('e1');
    });

    it('should update event', async () => {
      const res = await communityEventsController.update('outdoor', 'e1', user, { title: 'Updated' });
      expect(mockEventsService.update).toHaveBeenCalledWith('outdoor', 'e1', 'user-1', { title: 'Updated' });
      expect(res.title).toBe('Updated');
    });

    it('should delete event', async () => {
      const res = await communityEventsController.softDelete('outdoor', 'e1', user);
      expect(mockEventsService.softDelete).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.success).toBe(true);
    });

    it('should join event', async () => {
      const res = await communityEventsController.join('outdoor', 'e1', user);
      expect(mockEventsService.join).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.joined).toBe(true);
    });

    it('should leave event', async () => {
      const res = await communityEventsController.leave('outdoor', 'e1', user);
      expect(mockEventsService.leave).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.joined).toBe(false);
    });

    it('should approve event', async () => {
      const res = await communityEventsController.approve('outdoor', 'e1', user);
      expect(mockEventsService.approve).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.approvalStatus).toBe('approved');
    });

    it('should reject event', async () => {
      const res = await communityEventsController.reject('outdoor', 'e1', user, { reason: 'No safety plan' });
      expect(mockEventsService.reject).toHaveBeenCalledWith('outdoor', 'e1', 'user-1', { reason: 'No safety plan' });
      expect(res.approvalStatus).toBe('rejected');
    });

    it('should ban user from event', async () => {
      const res = await communityEventsController.banUser('outdoor', 'e1', user, {
        userId: '11111111-1111-1111-1111-111111111111',
        reason: 'Violated rules',
      });
      expect(mockEventsService.banUser).toHaveBeenCalledWith('outdoor', 'e1', 'user-1', {
        userId: '11111111-1111-1111-1111-111111111111',
        reason: 'Violated rules',
      });
      expect(res.banned).toBe(true);
    });

    it('should toggle save event', async () => {
      const res = await communityEventsController.toggleSave('outdoor', 'e1', user);
      expect(mockEventsService.toggleSave).toHaveBeenCalledWith('outdoor', 'e1', 'user-1');
      expect(res.saved).toBe(true);
    });
  });

  describe('AdminEventsController', () => {
    it('should list pending events', async () => {
      const res = await adminEventsController.listPendingEvents('outdoor', user, { page: 1, limit: 10 });
      expect(mockEventsService.listPendingEvents).toHaveBeenCalledWith('outdoor', 'user-1', { page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
    });
  });
});
