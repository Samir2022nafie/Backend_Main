import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '@/core/database/prisma.service';
import { SessionService } from '@/modules/auth/session.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    users: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    community_members: {
      findMany: jest.fn(),
    },
    communities: {
      findMany: jest.fn(),
    },
  };

  const mockSessionService = {
    revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
  };

  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findManagedCommunities', () => {
    it('should return all communities where user is creator/admin/moderator', async () => {
      const mockMemberships = [
        {
          role: 'admin',
          community: {
            id: 'c1',
            name: 'Photography Club',
            slug: 'photography-club',
            creator_id: userId,
            banner_url: null,
            profile_picture_url: null,
            deleted_at: null,
            _count: { members: 10 },
          },
        },
        {
          role: 'moderator',
          community: {
            id: 'c2',
            name: 'Hiking Group',
            slug: 'hiking-group',
            creator_id: 'other-user',
            banner_url: null,
            profile_picture_url: null,
            deleted_at: null,
            _count: { members: 25 },
          },
        },
      ];

      mockPrismaService.community_members.findMany.mockResolvedValueOnce(mockMemberships);

      const result = await service.findManagedCommunities(userId);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('owner'); // creator_id matches userId
      expect(result[1].role).toBe('moderator');
      expect(result[0].memberCount).toBe(10);
    });
  });

  describe('getProfile', () => {
    it('should return sanitized user profile if found and not deleted', async () => {
      const mockUser = {
        id: userId,
        username: 'johndoe',
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password_hash: 'secret_hash',
        deleted_at: null,
      };

      mockPrismaService.users.findFirst.mockResolvedValueOnce(mockUser);

      const result = await service.getProfile(userId);

      expect(result.id).toBe(userId);
      expect(result.username).toBe('johndoe');
      expect((result as any).password_hash).toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist or is soft deleted', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce(null);

      await expect(service.getProfile(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update user fields and full name', async () => {
      const existingUser = {
        id: userId,
        first_name: 'John',
        last_name: 'Doe',
        name: 'John Doe',
        bio: 'Old bio',
      };
      mockPrismaService.users.findFirst.mockResolvedValueOnce(existingUser);
      mockPrismaService.users.update.mockResolvedValueOnce({
        ...existingUser,
        bio: 'New bio',
        first_name: 'Johnny',
        name: 'Johnny Doe',
      });

      const result = await service.updateProfile(userId, {
        bio: 'New bio',
        firstName: 'Johnny',
      });

      expect(result.bio).toBe('New bio');
      expect(mockPrismaService.users.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          bio: 'New bio',
          first_name: 'Johnny',
          name: 'Johnny Doe',
        }),
      });
    });
  });

  describe('softDelete', () => {
    it('should set deleted_at and revoke all sessions for user', async () => {
      mockPrismaService.users.update.mockResolvedValueOnce({});

      const result = await service.softDelete(userId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.users.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deleted_at: expect.any(Date) },
      });
      expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile with counts and following status', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce({
        id: 'target-id',
        username: 'alice',
        name: 'Alice Wonder',
        _count: { followers: 5, following: 2, community_memberships: 3 },
      });
      (mockPrismaService as any).user_blocks = { findFirst: jest.fn().mockResolvedValueOnce(null) };
      (mockPrismaService as any).user_follows = { findUnique: jest.fn().mockResolvedValueOnce({ follower_id: userId }) };

      const result = await service.getPublicProfile('target-id', userId);

      expect(result.username).toBe('alice');
      expect(result.stats.followersCount).toBe(5);
      expect(result.isFollowing).toBe(true);
    });

    it('should throw NotFoundException if blocked in either direction', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce({ id: 'target-id' });
      (mockPrismaService as any).user_blocks = {
        findFirst: jest.fn().mockResolvedValueOnce({ blocker_id: 'target-id', blocked_id: userId }),
      };

      await expect(service.getPublicProfile('target-id', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('followUser & unfollowUser', () => {
    it('should prevent following yourself', async () => {
      await expect(service.followUser(userId, userId)).rejects.toThrow('Cannot follow yourself');
    });

    it('should follow target user and create notification', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce({ id: 'target-id' });
      (mockPrismaService as any).user_blocks = { findFirst: jest.fn().mockResolvedValueOnce(null) };
      (mockPrismaService as any).user_follows = {
        upsert: jest.fn().mockResolvedValueOnce({}),
        deleteMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      };
      (mockPrismaService as any).notifications = { create: jest.fn().mockResolvedValueOnce({}) };

      const result = await service.followUser('target-id', userId);
      expect(result.following).toBe(true);
      expect((mockPrismaService as any).notifications.create).toHaveBeenCalled();

      const unfollowResult = await service.unfollowUser('target-id', userId);
      expect(unfollowResult.following).toBe(false);
    });
  });

  describe('blockUser & unblockUser', () => {
    it('should prevent blocking yourself', async () => {
      await expect(service.blockUser(userId, userId)).rejects.toThrow('Cannot block yourself');
    });

    it('should block user and delete mutual follows', async () => {
      mockPrismaService.users.findFirst.mockResolvedValueOnce({ id: 'target-id' });
      (mockPrismaService as any).user_blocks = {
        upsert: jest.fn().mockResolvedValueOnce({}),
        deleteMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
      };
      (mockPrismaService as any).user_follows = {
        deleteMany: jest.fn().mockResolvedValueOnce({ count: 2 }),
      };

      const result = await service.blockUser('target-id', userId);
      expect(result.blocked).toBe(true);
      expect((mockPrismaService as any).user_follows.deleteMany).toHaveBeenCalled();

      const unblockResult = await service.unblockUser('target-id', userId);
      expect(unblockResult.blocked).toBe(false);
    });
  });

  describe('getTrustScore', () => {
    it('should return trust score and tier (Trusted >= 80, Member >= 50, New < 50)', async () => {
      mockPrismaService.users.findFirst
        .mockResolvedValueOnce({ id: 'u1', trust_score: 85 })
        .mockResolvedValueOnce({ id: 'u2', trust_score: 60 })
        .mockResolvedValueOnce({ id: 'u3', trust_score: 30 });
      (mockPrismaService as any).user_blocks = { findFirst: jest.fn().mockResolvedValue(null) };

      const res1 = await service.getTrustScore('u1', userId);
      expect(res1.tier).toBe('Trusted');

      const res2 = await service.getTrustScore('u2', userId);
      expect(res2.tier).toBe('Member');

      const res3 = await service.getTrustScore('u3', userId);
      expect(res3.tier).toBe('New');
    });
  });
});
