import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CommentsService', () => {
  let service: CommentsService;

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
      findFirst: jest.fn(),
    },
    comments: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user_blocks: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    comment_reactions: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const authorId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const ownerId = '33333333-3333-3333-3333-333333333333';
  const modId = '44444444-4444-4444-4444-444444444444';
  const communityId = '55555555-5555-5555-5555-555555555555';
  const postId = '66666666-6666-6666-6666-666666666666';
  const commentId = '77777777-7777-7777-7777-777777777777';

  const mockCommunity = {
    id: communityId,
    name: 'Outdoor Club',
    slug: 'outdoor-club',
    creator_id: ownerId,
    is_private: false,
    deleted_at: null,
  };

  const mockPost = {
    id: postId,
    community_id: communityId,
    community: mockCommunity,
    deleted_at: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        CaslAbilityFactory,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should allow member to create a top-level comment', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(mockPost);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      mockPrismaService.comments.create.mockResolvedValueOnce({
        id: commentId,
        post_id: postId,
        author_id: authorId,
        parent_comment_id: null,
        content: 'Great post!',
        created_at: new Date(),
        updated_at: new Date(),
        author: { id: authorId, username: 'trailrunner', name: 'Trail Runner' },
      });

      const result = await service.create(postId, authorId, {
        content: 'Great post!',
      });

      expect(result.id).toBe(commentId);
      expect(result.parentCommentId).toBeNull();
      expect(result.reactionCount).toBe(0);
      expect(result.hasReacted).toBe(false);
    });

    it('should throw ForbiddenException if user is not a member of the community', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(mockPost);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(postId, otherUserId, { content: 'Sneak comment' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if post does not exist', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.create(postId, authorId, { content: 'Comment' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create direct reply and reparent nested reply to root comment', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(mockPost);
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce({ role: 'member' });
      // Parent is already a reply to root-comment
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: 'reply-1',
        parent_comment_id: 'root-comment',
        post_id: postId,
        deleted_at: null,
      });
      mockPrismaService.comments.create.mockResolvedValueOnce({
        id: 'reply-2',
        post_id: postId,
        author_id: authorId,
        parent_comment_id: 'root-comment',
        content: 'Reparented reply',
        created_at: new Date(),
        updated_at: new Date(),
        author: { id: authorId, username: 'trailrunner' },
      });

      const result = await service.create(postId, authorId, {
        content: 'Reparented reply',
        parentCommentId: 'reply-1',
      });

      expect(result.parentCommentId).toBe('root-comment');
    });
  });

  describe('findAll', () => {
    it('should return paginated top-level comments with direct replies', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce(mockPost);
      mockPrismaService.user_blocks.findMany
        .mockResolvedValueOnce([{ blocked_id: otherUserId }])
        .mockResolvedValueOnce([]);
      mockPrismaService.comments.count.mockResolvedValueOnce(1);
      mockPrismaService.comments.findMany.mockResolvedValueOnce([
        {
          id: commentId,
          post_id: postId,
          parent_comment_id: null,
          content: 'Top-level comment',
          created_at: new Date(),
          updated_at: new Date(),
          author: { id: authorId, username: 'trailrunner' },
          _count: { reactions: 3, replies: 1 },
          reactions: [{ user_id: authorId }],
          replies: [
            {
              id: 'reply-1',
              post_id: postId,
              parent_comment_id: commentId,
              content: 'Direct reply',
              created_at: new Date(),
              updated_at: new Date(),
              author: { id: ownerId, username: 'owner' },
              _count: { reactions: 0 },
              reactions: [],
            },
          ],
        },
      ]);

      const result = await service.findAll(postId, { page: 1, limit: 20 }, authorId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].reactionCount).toBe(3);
      expect(result.data[0].hasReacted).toBe(true);
      expect(result.data[0].replies).toHaveLength(1);
    });

    it('should throw ForbiddenException if community is private and caller is not a member', async () => {
      mockPrismaService.posts.findFirst.mockResolvedValueOnce({
        ...mockPost,
        community: { ...mockCommunity, is_private: true },
      });
      mockPrismaService.community_members.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.findAll(postId, { page: 1, limit: 20 }, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return single comment details', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        post_id: postId,
        parent_comment_id: null,
        content: 'Hello World',
        created_at: new Date(),
        updated_at: new Date(),
        post: { ...mockPost },
        author: { id: authorId, username: 'author', deleted_at: null },
        _count: { reactions: 2, replies: 0 },
        reactions: [],
        replies: [],
      });
      mockPrismaService.user_blocks.findFirst.mockResolvedValueOnce(null);

      const result = await service.findOne(commentId, authorId);

      expect(result.id).toBe(commentId);
      expect(result.content).toBe('Hello World');
    });

    it('should throw NotFoundException if author is blocked', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        post_id: postId,
        post: { ...mockPost },
        author: { id: otherUserId, deleted_at: null },
        _count: { reactions: 0, replies: 0 },
        reactions: [],
        replies: [],
      });
      mockPrismaService.user_blocks.findFirst.mockResolvedValueOnce({
        blocker_id: authorId,
        blocked_id: otherUserId,
      });

      await expect(service.findOne(commentId, authorId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow author to update comment', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        author_id: authorId,
      });
      mockPrismaService.comments.update.mockResolvedValueOnce({
        id: commentId,
        post_id: postId,
        parent_comment_id: null,
        content: 'Updated comment content',
        created_at: new Date(),
        updated_at: new Date(),
        author: { id: authorId, username: 'author' },
      });

      const result = await service.update(commentId, authorId, {
        content: 'Updated comment content',
      });

      expect(result.content).toBe('Updated comment content');
    });

    it('should forbid non-author from updating comment', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        author_id: authorId,
      });

      await expect(
        service.update(commentId, otherUserId, { content: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('softDelete', () => {
    it('should allow author to soft delete comment', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        author_id: authorId,
        post: { community_id: communityId },
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);
      mockPrismaService.comments.update.mockResolvedValueOnce({});

      const result = await service.softDelete(commentId, authorId);

      expect(result.success).toBe(true);
      expect(mockPrismaService.comments.update).toHaveBeenCalledWith({
        where: { id: commentId },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it('should allow community moderator to delete comment via CASL', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        author_id: authorId,
        post: { community_id: communityId },
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      // Mod membership in this community
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([
        { community_id: communityId },
      ]);
      mockPrismaService.comments.update.mockResolvedValueOnce({});

      const result = await service.softDelete(commentId, modId);

      expect(result.success).toBe(true);
    });

    it('should forbid regular member from deleting another member comment', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        author_id: authorId,
        post: { community_id: communityId },
      });
      mockPrismaService.communities.findMany.mockResolvedValueOnce([]);
      mockPrismaService.community_members.findMany.mockResolvedValueOnce([]);

      await expect(service.softDelete(commentId, otherUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleReaction', () => {
    it('should add reaction when not already reacted', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        post: mockPost,
      });
      mockPrismaService.comment_reactions.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.comment_reactions.create.mockResolvedValueOnce({});
      mockPrismaService.comment_reactions.count.mockResolvedValueOnce(1);

      const result = await service.toggleReaction(commentId, authorId);

      expect(result.reacted).toBe(true);
      expect(result.reactionCount).toBe(1);
    });

    it('should remove reaction when already reacted', async () => {
      mockPrismaService.comments.findFirst.mockResolvedValueOnce({
        id: commentId,
        post: mockPost,
      });
      mockPrismaService.comment_reactions.findUnique.mockResolvedValueOnce({
        comment_id: commentId,
        user_id: authorId,
      });
      mockPrismaService.comment_reactions.delete.mockResolvedValueOnce({});
      mockPrismaService.comment_reactions.count.mockResolvedValueOnce(0);

      const result = await service.toggleReaction(commentId, authorId);

      expect(result.reacted).toBe(false);
      expect(result.reactionCount).toBe(0);
    });
  });
});
