import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '@/core/database/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    communities: {
      findFirst: jest.fn(),
    },
    community_members: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    posts: {
      count: jest.fn(),
    },
    events: {
      count: jest.fn(),
    },
    reports: {
      count: jest.fn(),
    },
  };

  const ownerId = '11111111-1111-1111-1111-111111111111';
  const adminId = '22222222-2222-2222-2222-222222222222';
  const modId = '33333333-3333-3333-3333-333333333333';
  const memberId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';

  const community = {
    id: communityId,
    name: 'Outdoor Explorers',
    slug: 'outdoor-explorers',
    creator_id: ownerId,
    deleted_at: null,
    category: { id: 'cat-1', name: 'outdoor_adventure' },
    location: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCommunityOverview', () => {
    it('should return overview with role owner when caller is creator', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
      mockPrismaService.community_members.count.mockResolvedValueOnce(42);

      const result = await service.getCommunityOverview('outdoor-explorers', ownerId);

      expect(result.myRole).toBe('owner');
      expect(result.memberCount).toBe(42);
      expect(result.community.name).toBe('Outdoor Explorers');
    });

    it('should return overview with role admin when caller is an admin', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'admin',
      });
      mockPrismaService.community_members.count.mockResolvedValueOnce(42);

      const result = await service.getCommunityOverview('outdoor-explorers', adminId);

      expect(result.myRole).toBe('admin');
      expect(result.memberCount).toBe(42);
    });

    it('should throw ForbiddenException if caller is a regular member', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'member',
      });

      await expect(service.getCommunityOverview('outdoor-explorers', memberId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if community does not exist', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(null);

      await expect(service.getCommunityOverview('non-existent', ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCommunityStats', () => {
    it('should compute aggregated metrics for owner/admin/mod', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
      // caller is mod
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'moderator',
      });

      // totalMembers, posts, events, reports, pendingEvents, newMembersThisWeek
      mockPrismaService.community_members.count
        .mockResolvedValueOnce(120) // totalMembers
        .mockResolvedValueOnce(14); // newMembersThisWeek
      mockPrismaService.posts.count.mockResolvedValueOnce(45);
      mockPrismaService.events.count
        .mockResolvedValueOnce(12) // totalEvents
        .mockResolvedValueOnce(3); // pendingEvents
      mockPrismaService.reports.count.mockResolvedValueOnce(2);

      const stats = await service.getCommunityStats('outdoor-explorers', modId);

      expect(stats).toEqual({
        totalMembers: 120,
        totalPosts: 45,
        totalEvents: 12,
        pendingReports: 2,
        pendingEvents: 3,
        newMembersThisWeek: 14,
      });
    });

    it('should throw ForbiddenException for non-admin/mod/owner', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'member',
      });

      await expect(service.getCommunityStats('outdoor-explorers', memberId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
