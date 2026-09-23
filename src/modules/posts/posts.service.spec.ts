import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PostsService', () => {
  let service: PostsService;

  const mockPrismaService = {
    communities: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    community_members: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    posts: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    tags: {
      upsert: jest.fn(),
    },
    post_tags: {
      deleteMany: jest.fn(),
    },
    user_blocks: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    post_reactions: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    saved_posts: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const authorId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';
  const modId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';
  const postId = '66666666-6666-6666-6666-666666666666';

  const mockCommunity = {
    id: communityId,
    name: 'Outdoor Club',
    slug: 'outdoor-club',
    creator_id: ownerId,
    is_private: false,
    deleted_at: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        CaslAbilityFactory,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should allow active community member to create a post with tags', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({
        role: 'member',
      });
      mockPrismaService.tags.upsert.mockResolvedValueOnce({ id: 'tag-1', name: 'hiking' });
      mockPrismaService.posts.create.mockResolvedValueOnce({
        id: postId,
        community_id: communityId,
        author_id: authorId,
        title: 'Trail Run',
        content: 'Scenic 10k trail run this weekend.',
        media_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        author: { id: authorId, username: 'trailrunner', name: 'Trail Runner' },
        tags: [{ tag: { id: 'tag-1', name: 'hiking' } }],
      });

      const result = await service.create('outdoor-club', authorId, {
        title: 'Trail Run',
        content: 'Scenic 10k trail run this weekend.',
        tags: ['hiking'],
      });

      expect(result.id).toBe(postId);
      expect(result.tags).toEqual(['hiking']);
      expect(mockPrismaService.tags.upsert).toHaveBeenCalledWith({
        where: { name: 'hiking' },
        create: { name: 'hiking' },
        update: {},
      });
    });

    it('should throw ForbiddenException if user is not a member of the community', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create('outdoor-club', otherUserId, { content: 'Hello everyone' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if community does not exist', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.create('non-existent', authorId, { content: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return list of posts and exclude blocked users', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce(mockCommunity);
      mockPrismaService.user_blocks.findMany
        .mockResolvedValueOnce([{ blocked_id: otherUserId }]) // blocks given
        .mockResolvedValueOnce([]); // blocks received
      mockPrismaService.posts.count.mockResolvedValueOnce(1);
      mockPrismaService.posts.findMany.mockResolvedValueOnce([
        {
          id: postId,
          community_id: communityId,
          title: 'Morning Trek',
          content: 'Great view!',
          media_url: null,
          created_at: new Date(),
          updated_at: new Date(),
          author: { id: authorId, username: 'trailrunner' },
          tags: [{ tag: { name: 'trekking' } }],
          reactions: [{ user_id: authorId }],
          saved_by: [],
          _count: { reactions: 1, comments: 2 },
        },
      ]);

      const result = await service.findAll('outdoor-club', { page: 1, limit: 20 }, authorId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].hasReacted).toBe(true);
      expect(result.data[0].hasSaved).toBe(false);
      expect(result.data[0].reactionCount).toBe(1);
      expect(result.data[0].commentCount).toBe(2);
    });

    it('should throw ForbiddenException if community is private and caller is not a member', async () => {
      mockPrismaService.communities.findFirst.mockResolvedValueOnce({
        ...mockCommunity,
        is_private: true,
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.findAll('outdoor-club', { page: 1, limit: 20 }, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return post details with comments', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        title: 'Post Title',
        content: 'Content',
        media_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        author_id: authorId,
        community: { ...mockCommunity },
        author: { id: authorId, username: 'author', deleted_at: null },
        tags: [{ tag: { name: 'outdoor' } }],
        reactions: [],
        saved_by: [],
        _count: { reactions: 5, comments: 1 },
        comments: [
          {
            id: 'c-1',
            content: 'Nice post!',
            created_at: new Date(),
            updated_at: new Date(),
            author: { id: otherUserId, username: 'commenter' },
            _count: { replies: 0 },
          },
        ],
      });
      mockPrismaService.user_blocks.findFirst.mockResolvedValueOnce(null);

      const result = await service.findOne(postId, authorId);

      expect(result.id).toBe(postId);
      expect(result.comments).toHaveLength(1);
      expect(result.tags).toEqual(['outdoor']);
    });

    it('should throw NotFoundException if author is blocked', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        community: { ...mockCommunity },
        author: { id: otherUserId, deleted_at: null },
        tags: [],
        comments: [],
        _count: { reactions: 0, comments: 0 },
      });
      mockPrismaService.user_blocks.findFirst.mockResolvedValueOnce({ blocker_id: authorId, blocked_id: otherUserId });

      await expect(service.findOne(postId, authorId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow author to update post and re-link tags', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        author_id: authorId,
      });
      mockPrismaService.post_tags.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockPrismaService.tags.upsert.mockResolvedValueOnce({ id: 'tag-new', name: 'camping' });
      mockPrismaService.posts.update.mockResolvedValueOnce({
        id: postId,
        community_id: communityId,
        title: 'Updated Title',
        content: 'Updated Content',
        media_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        author: { id: authorId, username: 'author' },
        tags: [{ tag: { name: 'camping' } }],
      });

      const result = await service.update(postId, authorId, {
        title: 'Updated Title',
        content: 'Updated Content',
        tags: ['camping'],
      });

      expect(result.title).toBe('Updated Title');
      expect(result.tags).toEqual(['camping']);
    });

    it('should forbid non-author from updating post', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        author_id: authorId,
      });

      await expect(
        service.update(postId, otherUserId, { title: 'Hacked Title' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('softDelete', () => {
    it('should allow author to delete post', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        author_id: authorId,
        community_id: communityId,
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);
      mockPrismaService.posts.update.mockResolvedValueOnce({});

      const result = await service.softDelete(postId, authorId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.posts.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it('should allow community moderator to delete post of another member', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        author_id: authorId,
        community_id: communityId,
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      // Mod membership in this community
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([
        { community_id: communityId },
      ]);
      mockPrismaService.posts.update.mockResolvedValueOnce({});

      const result = await service.softDelete(postId, modId);

      expect(result.success).toBe(true);
    });

    it('should forbid regular member from deleting someone else post', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        author_id: authorId,
        community_id: communityId,
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);

      await expect(service.softDelete(postId, otherUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleReaction', () => {
    it('should add reaction when not already reacted', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        community: mockCommunity,
      });
      mockPrismaService.post_reactions.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.post_reactions.create.mockResolvedValueOnce({});
      mockPrismaService.post_reactions.count.mockResolvedValueOnce(1);

      const result = await service.toggleReaction(postId, authorId);

      expect(result.reacted).toBe(true);
      expect(result.reactionCount).toBe(1);
    });

    it('should remove reaction when already reacted', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        community: mockCommunity,
      });
      mockPrismaService.post_reactions.findUnique.mockResolvedValueOnce({ post_id: postId, user_id: authorId });
      mockPrismaService.post_reactions.delete.mockResolvedValueOnce({});
      mockPrismaService.post_reactions.count.mockResolvedValueOnce(0);

      const result = await service.toggleReaction(postId, authorId);

      expect(result.reacted).toBe(false);
      expect(result.reactionCount).toBe(0);
    });
  });

  describe('toggleSave', () => {
    it('should save post when not already saved', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        community: mockCommunity,
      });
      mockPrismaService.saved_posts.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.saved_posts.create.mockResolvedValueOnce({});

      const result = await service.toggleSave(postId, authorId);

      expect(result.saved).toBe(true);
    });

    it('should unsave post when already saved', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        id: postId,
        community: mockCommunity,
      });
      mockPrismaService.saved_posts.findUnique.mockResolvedValueOnce({ post_id: postId, user_id: authorId });
      mockPrismaService.saved_posts.delete.mockResolvedValueOnce({});

      const result = await service.toggleSave(postId, authorId);

      expect(result.saved).toBe(false);
    });
  });
});
