import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    getCommunityOverview: jest.fn().mockResolvedValue({
      community: { id: 'c1', name: 'Outdoor', slug: 'outdoor' },
      myRole: 'owner',
      memberCount: 25,
    }),
    getCommunityStats: jest.fn().mockResolvedValue({
      totalMembers: 25,
      totalPosts: 10,
      totalEvents: 4,
      pendingReports: 0,
      pendingEvents: 1,
      newMembersThisWeek: 3,
    }),
  };

  const user = { id: 'user-admin-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle get community overview', async () => {
    const res = await controller.getCommunityOverview('outdoor', user);

    expect(mockAdminService.getCommunityOverview).toHaveBeenCalledWith('outdoor', 'user-admin-1');
    expect(res.myRole).toBe('owner');
    expect(res.memberCount).toBe(25);
  });

  it('should handle get community stats', async () => {
    const res = await controller.getCommunityStats('outdoor', user);

    expect(mockAdminService.getCommunityStats).toHaveBeenCalledWith('outdoor', 'user-admin-1');
    expect(res.totalMembers).toBe(25);
    expect(res.totalPosts).toBe(10);
  });
});
