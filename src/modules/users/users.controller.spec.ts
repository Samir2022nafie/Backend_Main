import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService: any = {
    findManagedCommunities: jest.fn().mockResolvedValue([
      { id: 'c1', name: 'Photography Club', role: 'owner', memberCount: 10 },
    ]),
    getProfile: jest.fn().mockResolvedValue({
      id: 'user-1',
      username: 'johndoe',
      email: 'john@example.com',
    }),
    updateProfile: jest.fn().mockResolvedValue({
      id: 'user-1',
      bio: 'New bio',
    }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return caller managed communities', async () => {
    const res = await controller.findManagedCommunities(user);

    expect(mockUsersService.findManagedCommunities).toHaveBeenCalledWith('user-1');
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe('owner');
  });

  it('should return caller profile', async () => {
    const res = await controller.getProfile(user);

    expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    expect(res.id).toBe('user-1');
  });

  it('should update caller profile', async () => {
    const dto = { bio: 'New bio' };
    const res = await controller.updateProfile(user, dto);

    expect(mockUsersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    expect(res.bio).toBe('New bio');
  });

  it('should soft delete caller account', async () => {
    const res = await controller.softDelete(user);

    expect(mockUsersService.softDelete).toHaveBeenCalledWith('user-1');
    expect(res.success).toBe(true);
  });

  it('should get public profile', async () => {
    mockUsersService.getPublicProfile = jest.fn().mockResolvedValue({ id: 'target-1', username: 'alice' });
    const res = await controller.getPublicProfile('target-1', user);

    expect(mockUsersService.getPublicProfile).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.username).toBe('alice');
  });

  it('should follow user', async () => {
    mockUsersService.followUser = jest.fn().mockResolvedValue({ following: true });
    const res = await controller.followUser('target-1', user);

    expect(mockUsersService.followUser).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.following).toBe(true);
  });

  it('should unfollow user', async () => {
    mockUsersService.unfollowUser = jest.fn().mockResolvedValue({ following: false });
    const res = await controller.unfollowUser('target-1', user);

    expect(mockUsersService.unfollowUser).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.following).toBe(false);
  });

  it('should block user', async () => {
    mockUsersService.blockUser = jest.fn().mockResolvedValue({ blocked: true });
    const res = await controller.blockUser('target-1', user);

    expect(mockUsersService.blockUser).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.blocked).toBe(true);
  });

  it('should unblock user', async () => {
    mockUsersService.unblockUser = jest.fn().mockResolvedValue({ blocked: false });
    const res = await controller.unblockUser('target-1', user);

    expect(mockUsersService.unblockUser).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.blocked).toBe(false);
  });

  it('should get trust score', async () => {
    mockUsersService.getTrustScore = jest.fn().mockResolvedValue({ trustScore: 75, tier: 'Member' });
    const res = await controller.getTrustScore('target-1', user);

    expect(mockUsersService.getTrustScore).toHaveBeenCalledWith('target-1', 'user-1');
    expect(res.tier).toBe('Member');
  });
});
