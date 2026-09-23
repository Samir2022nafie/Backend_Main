import { Test, TestingModule } from '@nestjs/testing';
import { HangoutsController } from './hangouts.controller';
import { HangoutsService } from './hangouts.service';

describe('HangoutsController', () => {
  let controller: HangoutsController;

  const mockHangoutsService = {
    create: jest.fn().mockResolvedValue({ id: 'h1', title: 'Hangout 1' }),
    findAll: jest.fn().mockResolvedValue({ data: [{ id: 'h1' }], meta: { total: 1 } }),
    findOne: jest.fn().mockResolvedValue({ id: 'h1', title: 'Hangout 1' }),
    update: jest.fn().mockResolvedValue({ id: 'h1', title: 'Updated' }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
    join: jest.fn().mockResolvedValue({ joined: true, participantsCount: 2 }),
    leave: jest.fn().mockResolvedValue({ joined: false, participantsCount: 1 }),
    requestJoin: jest.fn().mockResolvedValue({ requested: true, status: 'pending' }),
    respondRequest: jest.fn().mockResolvedValue({ status: 'approved', userId: 'u2' }),
    banUser: jest.fn().mockResolvedValue({ banned: true, userId: 'u2' }),
    toggleSave: jest.fn().mockResolvedValue({ saved: true }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HangoutsController],
      providers: [
        {
          provide: HangoutsService,
          useValue: mockHangoutsService,
        },
      ],
    }).compile();

    controller = module.get<HangoutsController>(HangoutsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create hangout', async () => {
    const res = await controller.create(user, {
      title: 'Cafe Meet',
      startsAt: '2026-10-15T10:00:00.000Z',
    });
    expect(mockHangoutsService.create).toHaveBeenCalledWith('user-1', {
      title: 'Cafe Meet',
      startsAt: '2026-10-15T10:00:00.000Z',
    });
    expect(res.id).toBe('h1');
  });

  it('should list hangouts', async () => {
    const res = await controller.findAll({ page: 1, limit: 20 }, user);
    expect(mockHangoutsService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 }, 'user-1');
    expect(res.data).toHaveLength(1);
  });

  it('should get single hangout', async () => {
    const res = await controller.findOne('h1', user);
    expect(mockHangoutsService.findOne).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.id).toBe('h1');
  });

  it('should update hangout', async () => {
    const res = await controller.update('h1', user, { title: 'Updated' });
    expect(mockHangoutsService.update).toHaveBeenCalledWith('h1', 'user-1', { title: 'Updated' });
    expect(res.title).toBe('Updated');
  });

  it('should soft delete hangout', async () => {
    const res = await controller.softDelete('h1', user);
    expect(mockHangoutsService.softDelete).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.success).toBe(true);
  });

  it('should join hangout', async () => {
    const res = await controller.join('h1', user);
    expect(mockHangoutsService.join).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.joined).toBe(true);
  });

  it('should leave hangout', async () => {
    const res = await controller.leave('h1', user);
    expect(mockHangoutsService.leave).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.joined).toBe(false);
  });

  it('should request to join hangout', async () => {
    const res = await controller.requestJoin('h1', user);
    expect(mockHangoutsService.requestJoin).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.requested).toBe(true);
  });

  it('should respond to join request', async () => {
    const res = await controller.respondRequest('h1', 'u2', user, { status: 'approved' });
    expect(mockHangoutsService.respondRequest).toHaveBeenCalledWith('h1', 'u2', 'user-1', {
      status: 'approved',
    });
    expect(res.status).toBe('approved');
  });

  it('should ban user', async () => {
    const res = await controller.banUser('h1', user, {
      userId: '11111111-1111-1111-1111-111111111111',
      reason: 'Spam',
    });
    expect(mockHangoutsService.banUser).toHaveBeenCalledWith('h1', 'user-1', {
      userId: '11111111-1111-1111-1111-111111111111',
      reason: 'Spam',
    });
    expect(res.banned).toBe(true);
  });

  it('should toggle save', async () => {
    const res = await controller.toggleSave('h1', user);
    expect(mockHangoutsService.toggleSave).toHaveBeenCalledWith('h1', 'user-1');
    expect(res.saved).toBe(true);
  });
});
