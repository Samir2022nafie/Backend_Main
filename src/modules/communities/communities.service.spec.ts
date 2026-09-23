import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { PrismaService } from '@/core/database/prisma.service';

describe('CommunitiesService', () => {
  let service: CommunitiesService;

  const mockPrismaService = {
    communities: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    community_members: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    categories: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const categoryId = '22222222-2222-2222-2222-222222222222';
  const communityId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CommunitiesService>(CommunitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      name: 'Photography Club',
      slug: 'photography-club',
      description: 'Photos and cameras',
      categoryId,
      isPrivate: false,
    };

    it('should create community and insert creator as admin member in transaction', async () => {
      mockPrismaService.categories.findUnique.mockResolvedValueOnce({ id: categoryId, name: 'Photography' });
      mockPrismaService.communities.findUnique.mockResolvedValueOnce(null); // slug available

      const createdComm = {
        id: communityId,
        ...createDto,
        creator_id: userId,
        deleted_at: null,
      };
      mockPrismaService.communities.create.mockResolvedValueOnce(createdComm);
      mockPrismaService.community_members.create.mockResolvedValueOnce({
        community_id: communityId,
        user_id: userId,
        role: 'admin',
      });

      const result = await service.create(userId, createDto);

      expect(mockPrismaService.categories.findUnique).toHaveBeenCalledWith({ where: { id: categoryId } });
      expect(mockPrismaService.communities.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: createDto.name,
            slug: createDto.slug,
            creator_id: userId,
            category_id: categoryId,
          }),
        }),
      );
      expect(mockPrismaService.community_members.create).toHaveBeenCalledWith({
        data: {
          community_id: communityId,
          user_id: userId,
          role: 'admin',
        },
      });
      expect(result.slug).toBe(createDto.slug);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      mockPrismaService.categories.findUnique.mockResolvedValueOnce(null);

      await expect(service.create(userId, createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if slug already exists and is not deleted', async () => {
      mockPrismaService.categories.findUnique.mockResolvedValueOnce({ id: categoryId });
      mockPrismaService.communities.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        slug: createDto.slug,
        deleted_at: null,
      });

      await expect(service.create(userId, createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findBySlug', () => {
    it('should return public community for visitor', async () => {
      const comm = {
        id: communityId,
        name: 'Photography Club',
        slug: 'photography-club',
        is_private: false,
        deleted_at: null,
        _count: { members: 5 },
        category: { id: categoryId, name: 'Photography' },
        location: null,
      };
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);

      const result = await service.findBySlug('photography-club');

      expect(result.slug).toBe('photography-club');
      expect(result.memberCount).toBe(5);
      expect(result.isMember).toBe(false);
    });

    it('should return membership status if caller is authenticated', async () => {
      const comm = {
        id: communityId,
        name: 'Photography Club',
        slug: 'photography-club',
        is_private: false,
        deleted_at: null,
        _count: { members: 5 },
        category: { id: categoryId, name: 'Photography' },
        location: null,
      };
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        community_id: communityId,
        user_id: userId,
        role: 'member',
      });

      const result = await service.findBySlug('photography-club', userId);

      expect(result.isMember).toBe(true);
      expect(result.myRole).toBe('member');
    });

    it('should throw ForbiddenException when visitor accesses a private community', async () => {
      const privateComm = {
        id: communityId,
        slug: 'secret-club',
        is_private: true,
        deleted_at: null,
      };
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(privateComm);

      await expect(service.findBySlug('secret-club')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-member accesses a private community', async () => {
      const privateComm = {
        id: communityId,
        slug: 'secret-club',
        is_private: true,
        deleted_at: null,
      };
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(privateComm);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(service.findBySlug('secret-club', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update & softDelete (Owner actions)', () => {
    const ownerId = userId;
    const nonOwnerId = '99999999-9999-9999-9999-999999999999';
    const comm = {
      id: communityId,
      slug: 'photography-club',
      creator_id: ownerId,
      deleted_at: null,
    };

    it('should allow owner to update community details', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);
      mockPrismaService.communities.update.mockResolvedValueOnce({
        ...comm,
        description: 'New Description',
      });

      const result = await service.update('photography-club', ownerId, {
        description: 'New Description',
      });

      expect(result.description).toBe('New Description');
    });

    it('should forbid non-owner from updating community details', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);

      await expect(
        service.update('photography-club', nonOwnerId, { description: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to soft delete community', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);
      mockPrismaService.communities.update.mockResolvedValueOnce({
        ...comm,
        deleted_at: new Date(),
      });

      const result = await service.softDelete('photography-club', ownerId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.communities.update).toHaveBeenCalledWith({
        where: { id: communityId },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it('should forbid non-owner from soft deleting community', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(comm);

      await expect(service.softDelete('photography-club', nonOwnerId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join & leave (Membership & Owner Protection)', () => {
    const ownerId = userId;
    const memberId = '88888888-8888-8888-8888-888888888888';
    const publicComm = {
      id: communityId,
      slug: 'photography-club',
      creator_id: ownerId,
      is_private: false,
      deleted_at: null,
    };

    it('should allow joining a public community', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(publicComm);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null); // not already member
      mockPrismaService.community_members.create.mockResolvedValueOnce({
        community_id: communityId,
        user_id: memberId,
        role: 'member',
      });

      const result = await service.join('photography-club', memberId);

      expect(result.role).toBe('member');
      expect(mockPrismaService.community_members.create).toHaveBeenCalledWith({
        data: {
          community_id: communityId,
          user_id: memberId,
          role: 'member',
        },
      });
    });

    it('should throw ConflictException if already a member when joining', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(publicComm);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'member',
      });

      await expect(service.join('photography-club', memberId)).rejects.toThrow(ConflictException);
    });

    it('should allow regular member to leave', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(publicComm);
      mockPrismaService.community_members.delete.mockResolvedValueOnce({});

      const result = await service.leave('photography-club', memberId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.community_members.delete).toHaveBeenCalled();
    });

    it('should protect owner: owner cannot leave without transferring ownership first', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(publicComm);

      // ownerId === publicComm.creator_id
      await expect(service.leave('photography-club', ownerId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listMembers, updateMemberRole, kickMember (Batch 3)', () => {
    const ownerId = userId;
    const adminId = '77777777-7777-7777-7777-777777777777';
    const regularMemberId = '88888888-8888-8888-8888-888888888888';
    const nonMemberId = '99999999-9999-9999-9999-999999999999';

    const community = {
      id: communityId,
      slug: 'photography-club',
      creator_id: ownerId,
      deleted_at: null,
    };

    describe('listMembers', () => {
      it('should allow admin/mod/owner to list members with pagination and search', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        // caller is admin
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          role: 'admin',
        });
        mockPrismaService.community_members.count.mockResolvedValueOnce(1);
        mockPrismaService.community_members.findMany.mockResolvedValueOnce([
          {
            user_id: regularMemberId,
            role: 'member',
            joined_at: new Date(),
            user: { id: regularMemberId, username: 'jane', name: 'Jane Doe' },
          },
        ]);

        const result = await service.listMembers('photography-club', adminId, { page: 1, limit: 20 });

        expect(result.data).toHaveLength(1);
        expect(result.meta.total).toBe(1);
      });

      it('should forbid regular member from listing all members with roles', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        // caller is regular member
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          role: 'member',
        });

        await expect(
          service.listMembers('photography-club', regularMemberId, { page: 1, limit: 20 }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('updateMemberRole', () => {
      it('should allow owner to promote member to moderator', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          community_id: communityId,
          user_id: regularMemberId,
          role: 'member',
        });
        mockPrismaService.community_members.update.mockResolvedValueOnce({
          community_id: communityId,
          user_id: regularMemberId,
          role: 'moderator',
        });

        const result = await service.updateMemberRole('photography-club', ownerId, regularMemberId, {
          role: 'moderator',
        });

        expect(result.role).toBe('moderator');
        expect(mockPrismaService.community_members.update).toHaveBeenCalledWith({
          where: {
            community_id_user_id: {
              community_id: communityId,
              user_id: regularMemberId,
            },
          },
          data: expect.objectContaining({
            role: 'moderator',
            appointed_by: ownerId,
            appointed_at: expect.any(Date),
          }),
        });
      });

      it('should forbid non-owner (even admin) from promoting or demoting members', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);

        await expect(
          service.updateMemberRole('photography-club', adminId, regularMemberId, { role: 'moderator' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should protect owner: cannot alter owner role', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);

        // target is ownerId
        await expect(
          service.updateMemberRole('photography-club', ownerId, ownerId, { role: 'member' }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('kickMember', () => {
      it('should allow admin/mod/owner to kick a regular member', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        // caller is admin
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          role: 'admin',
        });
        // target is member
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          community_id: communityId,
          user_id: regularMemberId,
          role: 'member',
        });
        mockPrismaService.community_members.delete.mockResolvedValueOnce({});

        const result = await service.kickMember('photography-club', adminId, regularMemberId);

        expect(result.success).toBe(true);
        expect(mockPrismaService.community_members.delete).toHaveBeenCalled();
      });

      it('should protect owner: cannot kick owner from their own community', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        // caller is admin
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          role: 'admin',
        });

        // target is ownerId
        await expect(service.kickMember('photography-club', adminId, ownerId)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should forbid regular member from kicking someone', async () => {
        mockPrismaService.communities.findFirst.mockResolvedValueOnce(community);
        mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
          role: 'member',
        });

        await expect(
          service.kickMember('photography-club', regularMemberId, regularMemberId),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
