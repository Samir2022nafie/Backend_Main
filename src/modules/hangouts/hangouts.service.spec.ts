import { Test, TestingModule } from '@nestjs/testing';
import { HangoutsService } from './hangouts.service';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('HangoutsService', () => {
  let service: HangoutsService;

  const mockPrismaService = {
    communities: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    community_members: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    hangouts: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    hangout_participants: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    hangout_join_requests: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    hangout_bans: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    saved_hangouts: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user_blocks: {
      findMany: jest.fn(),
    },
    notifications: {
      create: jest.fn(),
    },
  };

  const creatorId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';
  const modId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';
  const hangoutId = '66666666-6666-6666-6666-666666666666';

  const mockCommunity = {
    id: communityId,
    name: 'Weekend Climbers',
    slug: 'weekend-climbers',
    creator_id: ownerId,
    is_private: false,
    deleted_at: null,
  };

  const mockHangout = {
    id: hangoutId,
    creator_id: creatorId,
    community_id: communityId,
    title: 'Bouldering Session',
    starts_at: new Date('2026-10-12T18:00:00.000Z'),
    ends_at: new Date('2026-10-12T20:00:00.000Z'),
    visibility: 'public',
    join_type: 'open',
    max_participants: 10,
    community: mockCommunity,
    creator: { id: creatorId, username: 'climber', deleted_at: null },
    deleted_at: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HangoutsService,
        CaslAbilityFactory,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HangoutsService>(HangoutsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create standalone hangout without communityId', async () => {
      mockPrismaService.hangouts.create.mockResolvedValueOnce({
        ...mockHangout,
        community_id: null,
        community: null,
      });
      mockPrismaService.hangout_participants.create.mockResolvedValueOnce({});

      const result = await service.create(creatorId, {
        title: 'Open Cafe Chat',
        startsAt: '2026-10-12T18:00:00.000Z',
      });

      expect(result.id).toBe(hangoutId);
      expect(result.communityId).toBeNull();
      expect(mockPrismaService.hangout_participants.create).toHaveBeenCalledWith({
        data: { hangout_id: hangoutId, user_id: creatorId },
      });
    });

    it('should throw ForbiddenException if user is not a member of the community-tied hangout', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(otherUserId, {
          title: 'Climbers Meetup',
          startsAt: '2026-10-12T18:00:00.000Z',
          communityId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return list of public hangouts and filter blocked users', async () => {
      mockPrismaService.user_blocks.findMany
        .mockResolvedValueOnce([{ blocked_id: otherUserId }])
        .mockResolvedValueOnce([]);
      mockPrismaService.hangouts.count.mockResolvedValueOnce(1);
      mockPrismaService.hangouts.findMany.mockResolvedValueOnce([
        {
          ...mockHangout,
          _count: { participants: 3 },
          participants: [{ user_id: creatorId }],
          saved_by: [],
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 20 }, creatorId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isParticipant).toBe(true);
      expect(result.data[0].participantsCount).toBe(3);
    });
  });

  describe('findOne', () => {
    it('should return hangout details with attendees preview', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce({
        ...mockHangout,
        _count: { participants: 1 },
        participants: [{ user_id: creatorId }],
        saved_by: [],
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.hangout_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.findMany.mockResolvedValueOnce([
        { user: { id: creatorId, username: 'climber' } },
      ]);
      mockPrismaService.hangout_join_requests.findUnique.mockResolvedValueOnce(null);

      const result = await service.findOne(hangoutId, creatorId);

      expect(result.id).toBe(hangoutId);
      expect(result.participants).toHaveLength(1);
      expect(result.hasRequested).toBe(false);
    });
  });

  describe('update', () => {
    it('should allow creator to update hangout', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.hangouts.update.mockResolvedValueOnce({
        ...mockHangout,
        title: 'Updated Bouldering Session',
      });

      const result = await service.update(hangoutId, creatorId, {
        title: 'Updated Bouldering Session',
      });

      expect(result.title).toBe('Updated Bouldering Session');
    });

    it('should forbid non-creator from updating', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);

      await expect(
        service.update(hangoutId, otherUserId, { title: 'Hacked Title' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('softDelete', () => {
    it('should allow creator to delete hangout', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);
      mockPrismaService.hangouts.update.mockResolvedValueOnce({});

      const result = await service.softDelete(hangoutId, creatorId);

      expect(result.success).toBe(true);
    });

    it('should allow community moderator to delete community-tied hangout via CASL', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([
        { community_id: communityId },
      ]);
      mockPrismaService.hangouts.update.mockResolvedValueOnce({});

      const result = await service.softDelete(hangoutId, modId);

      expect(result.success).toBe(true);
    });
  });

  describe('join & leave', () => {
    it('should allow user to join open hangout with capacity', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.hangout_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      mockPrismaService.hangout_participants.create.mockResolvedValueOnce({});

      const result = await service.join(hangoutId, otherUserId);

      expect(result.joined).toBe(true);
      expect(result.participantsCount).toBe(4);
    });

    it('should reject join on request_based hangout', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce({
        ...mockHangout,
        join_type: 'request_based',
      });

      await expect(service.join(hangoutId, otherUserId)).rejects.toThrow(BadRequestException);
    });

    it('should reject join if hangout is full', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce({
        ...mockHangout,
        max_participants: 3,
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.hangout_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.count.mockResolvedValueOnce(3);

      await expect(service.join(hangoutId, otherUserId)).rejects.toThrow(BadRequestException);
    });

    it('should allow user to leave hangout', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.hangout_participants.findUnique.mockResolvedValueOnce({
        hangout_id: hangoutId,
        user_id: otherUserId,
      });
      mockPrismaService.hangout_participants.delete.mockResolvedValueOnce({});
      mockPrismaService.hangout_participants.count.mockResolvedValueOnce(0);

      const result = await service.leave(hangoutId, otherUserId);

      expect(result.joined).toBe(false);
    });
  });

  describe('requestJoin & respondRequest', () => {
    it('should create join request on request_based hangout and notify creator', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce({
        ...mockHangout,
        join_type: 'request_based',
      });
      mockPrismaService.hangout_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_participants.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.hangout_join_requests.upsert.mockResolvedValueOnce({});
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.requestJoin(hangoutId, otherUserId);

      expect(result.requested).toBe(true);
      expect(result.status).toBe('pending');
      expect(mockPrismaService.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: creatorId,
          type: 'hangout_request',
        }),
      });
    });

    it('should allow creator to approve join request and add participant', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.hangout_join_requests.findUnique.mockResolvedValueOnce({
        hangout_id: hangoutId,
        user_id: otherUserId,
        status: 'pending',
      });
      mockPrismaService.hangout_join_requests.update.mockResolvedValueOnce({});
      mockPrismaService.hangout_participants.count.mockResolvedValueOnce(1);
      mockPrismaService.hangout_participants.upsert.mockResolvedValueOnce({});
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.respondRequest(hangoutId, otherUserId, creatorId, {
        status: 'approved',
      });

      expect(result.status).toBe('approved');
      expect(result.userId).toBe(otherUserId);
      expect(mockPrismaService.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: otherUserId,
          type: 'hangout_approved',
        }),
      });
    });
  });

  describe('banUser', () => {
    it('should allow creator to ban user and evict them', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.hangout_bans.upsert.mockResolvedValueOnce({});
      mockPrismaService.hangout_participants.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.hangout_join_requests.deleteMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.banUser(hangoutId, creatorId, {
        userId: otherUserId,
        reason: 'Violated guidelines',
      });

      expect(result.banned).toBe(true);
      expect(result.userId).toBe(otherUserId);
    });

    it('should protect hangout creator from being banned', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);

      await expect(
        service.banUser(hangoutId, ownerId, { userId: creatorId }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleSave', () => {
    it('should toggle save on and off', async () => {
      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.saved_hangouts.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.saved_hangouts.create.mockResolvedValueOnce({});

      const res1 = await service.toggleSave(hangoutId, otherUserId);
      expect(res1.saved).toBe(true);

      mockPrismaService.hangouts.findFirst.mockResolvedValueOnce(mockHangout);
      mockPrismaService.saved_hangouts.findUnique.mockResolvedValueOnce({ user_id: otherUserId });
      mockPrismaService.saved_hangouts.delete.mockResolvedValueOnce({});

      const res2 = await service.toggleSave(hangoutId, otherUserId);
      expect(res2.saved).toBe(false);
    });
  });
});
