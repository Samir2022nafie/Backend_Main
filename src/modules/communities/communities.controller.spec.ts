import { Test, TestingModule } from '@nestjs/testing';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';

describe('CommunitiesController', () => {
  let controller: CommunitiesController;

  const mockCommunitiesService = {
    create: jest.fn().mockResolvedValue({ id: 'c1', slug: 'photo-club' }),
    findAll: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    findBySlug: jest.fn().mockResolvedValue({ id: 'c1', slug: 'photo-club', name: 'Photography' }),
    update: jest.fn().mockResolvedValue({ id: 'c1', slug: 'photo-club', name: 'Updated Photography' }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
    join: jest.fn().mockResolvedValue({ role: 'member' }),
    leave: jest.fn().mockResolvedValue({ success: true }),
    listMembers: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    updateMemberRole: jest.fn().mockResolvedValue({ role: 'moderator' }),
    kickMember: jest.fn().mockResolvedValue({ success: true }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunitiesController],
      providers: [
        {
          provide: CommunitiesService,
          useValue: mockCommunitiesService,
        },
      ],
    }).compile();

    controller = module.get<CommunitiesController>(CommunitiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle community creation', async () => {
    const dto = {
      name: 'Photography',
      slug: 'photo-club',
      categoryId: 'cat-1',
    };

    const res = await controller.create(user, dto as any);

    expect(mockCommunitiesService.create).toHaveBeenCalledWith('user-1', dto);
    expect(res.slug).toBe('photo-club');
  });

  it('should handle list communities query', async () => {
    const query = { page: 1, limit: 20, q: 'photo' };

    const res = await controller.findAll(query, user);

    expect(mockCommunitiesService.findAll).toHaveBeenCalledWith(query, 'user-1');
    expect(res.meta.page).toBe(1);
  });

  it('should handle get single community by slug', async () => {
    const res = await controller.findBySlug('photo-club', user);

    expect(mockCommunitiesService.findBySlug).toHaveBeenCalledWith('photo-club', 'user-1');
    expect(res.name).toBe('Photography');
  });

  it('should handle community update by owner', async () => {
    const dto = { name: 'Updated Photography' };

    const res = await controller.update('photo-club', user, dto);

    expect(mockCommunitiesService.update).toHaveBeenCalledWith('photo-club', 'user-1', dto);
    expect(res.name).toBe('Updated Photography');
  });

  it('should handle soft delete by owner', async () => {
    const res = await controller.softDelete('photo-club', user);

    expect(mockCommunitiesService.softDelete).toHaveBeenCalledWith('photo-club', 'user-1');
    expect(res.success).toBe(true);
  });

  it('should handle join community', async () => {
    const res = await controller.join('photo-club', user);

    expect(mockCommunitiesService.join).toHaveBeenCalledWith('photo-club', 'user-1');
    expect(res.role).toBe('member');
  });

  it('should handle leave community', async () => {
    const res = await controller.leave('photo-club', user);

    expect(mockCommunitiesService.leave).toHaveBeenCalledWith('photo-club', 'user-1');
    expect(res.success).toBe(true);
  });

  it('should handle list members query', async () => {
    const query = { page: 1, limit: 20, role: 'admin' as const };

    const res = await controller.listMembers('photo-club', user, query);

    expect(mockCommunitiesService.listMembers).toHaveBeenCalledWith('photo-club', 'user-1', query);
    expect(res.meta.page).toBe(1);
  });

  it('should handle update member role by owner', async () => {
    const dto = { role: 'moderator' as const };

    const res = await controller.updateMemberRole('photo-club', 'target-user', user, dto);

    expect(mockCommunitiesService.updateMemberRole).toHaveBeenCalledWith(
      'photo-club',
      'user-1',
      'target-user',
      dto,
    );
    expect(res.role).toBe('moderator');
  });

  it('should handle kick member', async () => {
    const res = await controller.kickMember('photo-club', 'target-user', user);

    expect(mockCommunitiesService.kickMember).toHaveBeenCalledWith(
      'photo-club',
      'user-1',
      'target-user',
    );
    expect(res.success).toBe(true);
  });
});
