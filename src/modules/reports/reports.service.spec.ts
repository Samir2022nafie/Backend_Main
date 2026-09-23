import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    users: {
      findFirst: jest.fn(),
    },
    posts: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    comments: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    events: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    hangouts: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    communities: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    community_members: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    reports: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    moderation_actions: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    audit_logs: {
      create: jest.fn(),
    },
    notifications: {
      create: jest.fn(),
    },
    event_bans: {
      findMany: jest.fn(),
    },
    hangout_bans: {
      findMany: jest.fn(),
    },
  };

  const reporterId = '11111111-1111-1111-1111-111111111111';
  const offenderId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';
  const modId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';
  const reportId = '66666666-6666-6666-6666-666666666666';
  const postId = '77777777-7777-7777-7777-777777777777';

  const mockCommunity = {
    id: communityId,
    name: 'Art Hub',
    slug: 'art-hub',
    creator_id: ownerId,
    deleted_at: null,
  };

  const mockReport = {
    id: reportId,
    reporter_id: reporterId,
    reported_post_id: postId,
    reason: 'Inappropriate image',
    status: 'pending',
    post: {
      id: postId,
      title: 'Controversial Art',
      author_id: offenderId,
      community_id: communityId,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        CaslAbilityFactory,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReport', () => {
    it('should create report when post exists', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({ id: postId });
      mockPrismaService.reports.create.mockResolvedValueOnce(mockReport);

      const result = await service.createReport(reporterId, {
        reason: 'Inappropriate image',
        reportedPostId: postId,
      });

      expect(result.id).toBe(reportId);
      expect(mockPrismaService.reports.create).toHaveBeenCalledWith({
        data: {
          reporter_id: reporterId,
          reported_user_id: null,
          reported_post_id: postId,
          reported_comment_id: null,
          reported_event_id: null,
          reported_hangout_id: null,
          reason: 'Inappropriate image',
          status: 'pending',
        },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if reported post does not exist', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createReport(reporterId, {
          reason: 'Spam post',
          reportedPostId: postId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listReports', () => {
    it('should return empty list if caller has no managed communities', async () => {
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);

      const result = await service.listReports(reporterId, { page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return reports for caller managed communities', async () => {
      mockPrismaService.communities.findMany.mockResolvedValueOnce([mockCommunity]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);
      mockPrismaService.reports.count.mockResolvedValueOnce(1);
      mockPrismaService.reports.findMany.mockResolvedValueOnce([mockReport]);

      const result = await service.listReports(ownerId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('updateReportStatus', () => {
    it('should allow moderator to update status to resolved and notify reporter', async () => {
      mockPrismaService.reports.findUnique.mockResolvedValueOnce(mockReport);
      mockPrismaService.communities.findUnique.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.reports.update.mockResolvedValueOnce({
        ...mockReport,
        status: 'resolved',
        reviewed_by: modId,
      });
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.updateReportStatus(reportId, modId, { status: 'resolved' });

      expect(result.status).toBe('resolved');
      expect(mockPrismaService.notifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: reporterId,
          type: 'moderation_action',
        }),
      });
    });

    it('should forbid non-moderator from updating report status', async () => {
      mockPrismaService.reports.findUnique.mockResolvedValueOnce(mockReport);
      mockPrismaService.communities.findUnique.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });

      await expect(
        service.updateReportStatus(reportId, reporterId, { status: 'resolved' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('takeAction', () => {
    it('should record moderation action, remove content, create audit log, and resolve report', async () => {
      mockPrismaService.reports.findUnique.mockResolvedValueOnce(mockReport);
      mockPrismaService.communities.findUnique.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.posts.update.mockResolvedValueOnce({});
      mockPrismaService.moderation_actions.create.mockResolvedValueOnce({
        id: 'ma-1',
        action_type: 'content_removed',
        notes: 'Hate speech',
      });
      mockPrismaService.audit_logs.create.mockResolvedValueOnce({});
      mockPrismaService.reports.update.mockResolvedValueOnce({ ...mockReport, status: 'resolved' });
      mockPrismaService.notifications.create.mockResolvedValueOnce({});

      const result = await service.takeAction(reportId, ownerId, {
        actionType: 'content_removed',
        notes: 'Hate speech',
      });

      expect(result.moderationAction.action_type).toBe('content_removed');
      expect(result.report.status).toBe('resolved');
      expect(mockPrismaService.posts.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { deleted_at: expect.any(Date) },
      });
      expect(mockPrismaService.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actor_id: ownerId,
          action: 'content_removed',
          entity_type: 'report',
          entity_id: reportId,
        }),
      });
    });

    it('should protect community owner from ban action', async () => {
      mockPrismaService.reports.findUnique.mockResolvedValueOnce({
        ...mockReport,
        post: { ...mockReport.post, author_id: ownerId },
      });
      mockPrismaService.communities.findUnique.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'admin' });

      await expect(
        service.takeAction(reportId, modId, {
          actionType: 'ban',
          targetUserId: ownerId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listCommunityReports & listCommunityModerationActions', () => {
    it('should return community reports for community owner', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.reports.count.mockResolvedValueOnce(1);
      mockPrismaService.reports.findMany.mockResolvedValueOnce([mockReport]);

      const result = await service.listCommunityReports('art-hub', ownerId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
    });

    it('should return moderation actions for community moderator', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'moderator' });
      mockPrismaService.moderation_actions.count.mockResolvedValueOnce(1);
      mockPrismaService.moderation_actions.findMany.mockResolvedValueOnce([
        { id: 'ma-1', action_type: 'warn' },
      ]);

      const result = await service.listCommunityModerationActions('art-hub', modId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('listCommunityBannedUsers', () => {
    it('should aggregate event and hangout bans for community', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.event_bans.findMany.mockResolvedValueOnce([
        {
          event_id: 'e1',
          user_id: offenderId,
          reason: 'Disruptive',
          banned_at: new Date(),
          user: { id: offenderId, username: 'badactor' },
          event: { id: 'e1', title: 'Art Expo' },
        },
      ]);
      mockPrismaService.hangout_bans.findMany.mockResolvedValueOnce([]);

      const result = await service.listCommunityBannedUsers('art-hub', ownerId);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].bans).toHaveLength(1);
    });
  });
});
