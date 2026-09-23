import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;

  const mockPrismaService = {
    communities: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    community_members: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    events: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    event_participants: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    event_bans: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    saved_events: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    notifications: {
      create: jest.fn(),
    },
  };

  const authorId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';
  const modId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';
  const eventId = '66666666-6666-6666-6666-666666666666';

  const mockCommunity = {
    id: communityId,
    name: 'Trail Explorers',
    slug: 'trail-explorers',
    creator_id: ownerId,
    is_private: false,
    deleted_at: null,
  };

  const mockEvent = {
    id: eventId,
    community_id: communityId,
    creator_id: authorId,
    title: 'Sunrise Hike',
    starts_at: new Date('2026-10-10T06:00:00.000Z'),
    ends_at: new Date('2026-10-10T10:00:00.000Z'),
    visibility: 'public',
    approval_status: 'approved',
    is_verified: true,
    max_participants: 20,
    community: mockCommunity,
    creator: { id: authorId, username: 'trailrunner', deleted_at: null },
    deleted_at: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        CaslAbilityFactory,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create proposed event for regular member', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.events.create.mockResolvedValueOnce({
        ...mockEvent,
        approval_status: 'proposed',
        is_verified: false,
      });
      mockPrismaService.event_participants.create.mockResolvedValueOnce({});

      const result = await service.create('trail-explorers', authorId, {
        title: 'Morning Hike',
        startsAt: '2026-10-10T06:00:00.000Z',
      });

      expect(result.approvalStatus).toBe('proposed');
      expect(result.isVerified).toBe(false);
      expect(mockPrismaService.event_participants.create).toHaveBeenCalledWith({
        data: { event_id: mockEvent.id, user_id: authorId },
      });
    });

    it('should create auto-approved event for community owner', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.events.create.mockResolvedValueOnce({
        ...mockEvent,
        creator_id: ownerId,
        approval_status: 'approved',
        is_verified: true,
      });
      mockPrismaService.event_participants.create.mockResolvedValueOnce({});

      const result = await service.create('trail-explorers', ownerId, {
        title: 'Owner Annual Trek',
        startsAt: '2026-10-10T06:00:00.000Z',
      });

      expect(result.approvalStatus).toBe('approved');
      expect(result.isVerified).toBe(true);
    });

    it('should throw ForbiddenException if caller is not a community member', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create('trail-explorers', otherUserId, {
          title: 'Hike',
          startsAt: '2026-10-10T06:00:00.000Z',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should list events and exclude banned events', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.event_bans.findMany.mockResolvedValueOnce([{ event_id: 'banned-event-id' }]);
      mockPrismaService.events.count.mockResolvedValueOnce(1);
      mockPrismaService.events.findMany.mockResolvedValueOnce([
        {
          ...mockEvent,
          _count: { participants: 5 },
          participants: [{ user_id: authorId }],
          saved_by: [],
        },
      ]);

      const result = await service.findAll('trail-explorers', { page: 1, limit: 20 }, authorId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isParticipant).toBe(true);
      expect(result.data[0].participantsCount).toBe(5);
    });
  });

  describe('findOne', () => {
    it('should return single event with attendees preview', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce({
        ...mockEvent,
        _count: { participants: 1 },
        participants: [{ user_id: authorId }],
        saved_by: [],
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.event_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.event_participants.findMany.mockResolvedValueOnce([
        { user: { id: authorId, username: 'trailrunner' } },
      ]);

      const result = await service.findOne('trail-explorers', eventId, authorId);

      expect(result.id).toBe(eventId);
      expect(result.isBanned).toBe(false);
      expect(result.participants).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should allow author to update event', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.events.update.mockResolvedValueOnce({
        ...mockEvent,
        title: 'Updated Sunrise Hike',
      });

      const result = await service.update('trail-explorers', eventId, authorId, {
        title: 'Updated Sunrise Hike',
      });

      expect(result.title).toBe('Updated Sunrise Hike');
    });

    it('should forbid non-author / non-moderator from updating', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });

      await expect(
        service.update('trail-explorers', eventId, otherUserId, { title: 'Hacked Title' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('softDelete', () => {
    it('should allow author to soft delete event via CASL', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);
      mockPrismaService.events.update.mockResolvedValueOnce({});

      const result = await service.softDelete('trail-explorers', eventId, authorId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.events.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it('should allow community moderator to delete event via CASL', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([
        { community_id: communityId },
      ]);
      mockPrismaService.events.update.mockResolvedValueOnce({});

      const result = await service.softDelete('trail-explorers', eventId, modId);

      expect(result.success).toBe(true);
    });
  });

  describe('join & leave', () => {
    it('should allow user to join an approved event with capacity', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.event_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.event_participants.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.event_participants.count
        .mockResolvedValueOnce(5) // before
        .mockResolvedValueOnce(6); // after
      mockPrismaService.event_participants.create.mockResolvedValueOnce({});

      const result = await service.join('trail-explorers', eventId, otherUserId);

      expect(result.joined).toBe(true);
      expect(result.participantsCount).toBe(6);
    });

    it('should reject joining if user is banned from the event', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.event_bans.findUnique.mockResolvedValueOnce({ event_id: eventId });

      await expect(service.join('trail-explorers', eventId, otherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject joining if event is full', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce({
        ...mockEvent,
        max_participants: 5,
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.event_bans.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.event_participants.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.event_participants.count.mockResolvedValueOnce(5);

      await expect(service.join('trail-explorers', eventId, otherUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow user to leave an event', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.event_participants.findUnique.mockResolvedValueOnce({
        event_id: eventId,
        user_id: authorId,
      });
      mockPrismaService.event_participants.delete.mockResolvedValueOnce({});
      mockPrismaService.event_participants.count.mockResolvedValueOnce(0);

      const result = await service.leave('trail-explorers', eventId, authorId);

      expect(result.joined).toBe(false);
      expect(result.participantsCount).toBe(0);
    });
  });

  describe('approve & reject', () => {
    it('should allow community moderator to approve event and emit notification', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce({
        ...mockEvent,
        approval_status: 'proposed',
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.events.update.mockResolvedValueOnce({
        id: eventId,
        approval_status: 'approved',
        is_verified: true,
      });
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.approve('trail-explorers', eventId, modId);

      expect(result.approvalStatus).toBe('approved');
      expect(result.isVerified).toBe(true);
      expect(mockPrismaService.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: authorId,
          type: 'event_approved',
        }),
      });
    });

    it('should allow community moderator to reject event and emit notification', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce({
        ...mockEvent,
        approval_status: 'proposed',
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.events.update.mockResolvedValueOnce({
        id: eventId,
        approval_status: 'rejected',
        is_verified: false,
      });
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.reject('trail-explorers', eventId, modId, {
        reason: 'Incomplete safety plan',
      });

      expect(result.approvalStatus).toBe('rejected');
      expect(mockPrismaService.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: authorId,
          type: 'moderation_action',
        }),
      });
    });
  });

  describe('banUser', () => {
    it('should allow moderator to ban user and evict them from participants', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.event_bans.upsert.mockResolvedValueOnce({});
      mockPrismaService.event_participants.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.banUser('trail-explorers', eventId, modId, {
        userId: otherUserId,
        reason: 'Disruptive behavior',
      });

      expect(result.banned).toBe(true);
      expect(result.userId).toBe(otherUserId);
      expect(mockPrismaService.event_participants.deleteMany).toHaveBeenCalledWith({
        where: { event_id: eventId, user_id: otherUserId },
      });
    });

    it('should protect community owner from being banned from an event', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });

      await expect(
        service.banUser('trail-explorers', eventId, modId, { userId: ownerId }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleSave', () => {
    it('should save event if not saved', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.saved_events.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.saved_events.create.mockResolvedValueOnce({});

      const result = await service.toggleSave('trail-explorers', eventId, authorId);

      expect(result.saved).toBe(true);
    });

    it('should unsave event if already saved', async () => {
      mockPrismaService.events.findFirst.mockResolvedValueOnce(mockEvent);
      mockPrismaService.saved_events.findUnique.mockResolvedValueOnce({
        user_id: authorId,
        event_id: eventId,
      });
      mockPrismaService.saved_events.delete.mockResolvedValueOnce({});

      const result = await service.toggleSave('trail-explorers', eventId, authorId);

      expect(result.saved).toBe(false);
    });
  });

  describe('listPendingEvents', () => {
    it('should return pending proposed events for moderator', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.events.count.mockResolvedValueOnce(1);
      mockPrismaService.events.findMany.mockResolvedValueOnce([
        {
          ...mockEvent,
          approval_status: 'proposed',
          is_verified: false,
          _count: { participants: 1 },
        },
      ]);

      const result = await service.listPendingEvents('trail-explorers', modId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].approvalStatus).toBe('proposed');
    });

    it('should forbid regular member from viewing pending events', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });

      await expect(
        service.listPendingEvents('trail-explorers', authorId, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
