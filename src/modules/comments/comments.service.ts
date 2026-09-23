import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { subject } from '@casl/ability';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { ErrorCode } from '@/core/common/enums';
import {
  CreateCommentDto,
  UpdateCommentDto,
  CommentQueryDto,
} from './dto';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Create a comment on a post (Member+ only)
   */
  async create(postId: string, userId: string, dto: CreateCommentDto) {
    const post = await this.prisma.posts.findFirst({
      where: { id: postId, deleted_at: null },
      include: {
        community: {
          select: {
            id: true,
            creator_id: true,
            is_private: true,
            deleted_at: true,
          },
        },
      },
    });

    if (!post || post.community.deleted_at !== null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Role check: caller must be a member or owner of the community
    const isOwner = post.community.creator_id === userId;
    let isMember = isOwner;

    if (!isMember) {
      const membership = await this.prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: post.community.id,
            user_id: userId,
          },
        },
      });

      if (membership) {
        isMember = true;
      }
    }

    if (!isMember) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community members can comment on posts',
      });
    }

    // Validate parent comment if provided
    let resolvedParentId: string | null = null;
    if (dto.parentCommentId) {
      const parent = await this.prisma.comments.findFirst({
        where: {
          id: dto.parentCommentId,
          post_id: postId,
          deleted_at: null,
        },
      });

      if (!parent) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Parent comment not found',
        });
      }

      // Enforce 2-level hierarchy: if replying to a reply, attach to the root comment
      resolvedParentId = parent.parent_comment_id ?? parent.id;
    }

    const comment = await this.prisma.comments.create({
      data: {
        post_id: postId,
        author_id: userId,
        parent_comment_id: resolvedParentId,
        content: dto.content,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            first_name: true,
            last_name: true,
            profile_picture_url: true,
          },
        },
      },
    });

    // Notify post author if commenter is someone else
    if (post.author_id !== userId) {
      try {
        const commenterName = comment.author
          ? `${comment.author.first_name || ''} ${comment.author.last_name || ''}`.trim() || comment.author.name || comment.author.username
          : 'Someone';
        const snippet = dto.content.length > 80 ? `${dto.content.slice(0, 80)}...` : dto.content;

        await this.prisma.notifications.create({
          data: {
            user_id: post.author_id,
            type: 'comment_reply',
            title: 'New Comment on your post',
            message: `${commenterName} commented: "${snippet}"`,
            related_entity_type: 'post',
            related_entity_id: post.id,
          },
        });
      } catch {}
    }

    return {
      id: comment.id,
      postId: comment.post_id,
      parentCommentId: comment.parent_comment_id,
      content: comment.content,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      author: comment.author,
      reactionCount: 0,
      hasReacted: false,
    };
  }

  /**
   * List comments for a post (top-level + direct replies, 2-level hierarchy, block filtering)
   */
  async findAll(postId: string, query: CommentQueryDto, userId?: string) {
    const post = await this.prisma.posts.findFirst({
      where: { id: postId, deleted_at: null },
      include: {
        community: {
          select: {
            id: true,
            creator_id: true,
            is_private: true,
            deleted_at: true,
          },
        },
      },
    });

    if (!post || post.community.deleted_at !== null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Privacy gate: private communities require authentication and membership
    if (post.community.is_private) {
      if (!userId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This community is private. Authentication required.',
        });
      }

      const isOwner = post.community.creator_id === userId;
      if (!isOwner) {
        const membership = await this.prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: post.community.id,
              user_id: userId,
            },
          },
        });

        if (!membership) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'This community is private. Membership required to view comments.',
          });
        }
      }
    }

    // Block filtering: exclude blocked users
    let blockedUserIds: string[] = [];
    if (userId) {
      const [blocksGiven, blocksReceived] = await Promise.all([
        this.prisma.user_blocks.findMany({
          where: { blocker_id: userId },
          select: { blocked_id: true },
        }),
        this.prisma.user_blocks.findMany({
          where: { blocked_id: userId },
          select: { blocker_id: true },
        }),
      ]);

      blockedUserIds = [
        ...blocksGiven.map((b) => b.blocked_id),
        ...blocksReceived.map((b) => b.blocker_id),
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      post_id: postId,
      parent_comment_id: null,
      deleted_at: null,
      author: {
        deleted_at: null,
      },
    };

    if (blockedUserIds.length > 0) {
      where.author_id = { notIn: blockedUserIds };
    }

    const [total, items] = await Promise.all([
      this.prisma.comments.count({ where }),
      this.prisma.comments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              name: true,
              first_name: true,
              last_name: true,
              profile_picture_url: true,
            },
          },
          _count: {
            select: {
              reactions: true,
              replies: {
                where: {
                  deleted_at: null,
                  author: { deleted_at: null },
                  ...(blockedUserIds.length > 0
                    ? { author_id: { notIn: blockedUserIds } }
                    : {}),
                },
              },
            },
          },
          ...(userId
            ? {
                reactions: { where: { user_id: userId } },
              }
            : {}),
          replies: {
            where: {
              deleted_at: null,
              author: { deleted_at: null },
              ...(blockedUserIds.length > 0
                ? { author_id: { notIn: blockedUserIds } }
                : {}),
            },
            orderBy: { created_at: 'asc' },
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  first_name: true,
                  last_name: true,
                  profile_picture_url: true,
                },
              },
              _count: {
                select: {
                  reactions: true,
                },
              },
              ...(userId
                ? {
                    reactions: { where: { user_id: userId } },
                  }
                : {}),
            },
          },
        },
      }),
    ]);

    const formatted = items.map((c: any) => ({
      id: c.id,
      postId: c.post_id,
      parentCommentId: c.parent_comment_id,
      content: c.content,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      author: c.author,
      reactionCount: c._count.reactions,
      hasReacted: userId ? c.reactions?.length > 0 : false,
      replyCount: c._count.replies,
      replies: c.replies.map((r: any) => ({
        id: r.id,
        postId: r.post_id,
        parentCommentId: r.parent_comment_id,
        content: r.content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        author: r.author,
        reactionCount: r._count.reactions,
        hasReacted: userId ? r.reactions?.length > 0 : false,
      })),
    }));

    return {
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single comment by ID
   */
  async findOne(id: string, userId?: string) {
    const comment: any = await this.prisma.comments.findFirst({
      where: { id, deleted_at: null },
      include: {
        post: {
          include: {
            community: {
              select: {
                id: true,
                creator_id: true,
                is_private: true,
                deleted_at: true,
              },
            },
          },
        },
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            first_name: true,
            last_name: true,
            profile_picture_url: true,
            deleted_at: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            replies: { where: { deleted_at: null } },
          },
        },
        ...(userId
          ? {
              reactions: { where: { user_id: userId } },
            }
          : {}),
        replies: {
          where: { deleted_at: null, author: { deleted_at: null } },
          orderBy: { created_at: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                name: true,
                profile_picture_url: true,
              },
            },
            _count: { select: { reactions: true } },
            ...(userId ? { reactions: { where: { user_id: userId } } } : {}),
          },
        },
      },
    });

    if (
      !comment ||
      comment.post.deleted_at !== null ||
      comment.post.community.deleted_at !== null ||
      comment.author.deleted_at !== null
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Comment not found',
      });
    }

    // Block check
    if (userId) {
      const blockExists = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: userId, blocked_id: comment.author_id },
            { blocker_id: comment.author_id, blocked_id: userId },
          ],
        },
      });

      if (blockExists) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Comment not found',
        });
      }
    }

    // Privacy check
    if (comment.post.community.is_private) {
      if (!userId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This community is private. Authentication required.',
        });
      }

      const isOwner = comment.post.community.creator_id === userId;
      if (!isOwner) {
        const membership = await this.prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: comment.post.community.id,
              user_id: userId,
            },
          },
        });

        if (!membership) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'This community is private. Membership required to view comment.',
          });
        }
      }
    }

    return {
      id: comment.id,
      postId: comment.post_id,
      parentCommentId: comment.parent_comment_id,
      content: comment.content,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      author: {
        id: comment.author.id,
        username: comment.author.username,
        name: comment.author.name,
        first_name: comment.author.first_name,
        last_name: comment.author.last_name,
        profile_picture_url: comment.author.profile_picture_url,
      },
      reactionCount: comment._count.reactions,
      hasReacted: userId ? comment.reactions?.length > 0 : false,
      replyCount: comment._count.replies,
      replies: comment.replies.map((r: any) => ({
        id: r.id,
        postId: r.post_id,
        parentCommentId: r.parent_comment_id,
        content: r.content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        author: r.author,
        reactionCount: r._count.reactions,
        hasReacted: userId ? r.reactions?.length > 0 : false,
      })),
    };
  }

  /**
   * Update comment content (Author only)
   */
  async update(id: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.comments.findFirst({
      where: { id, deleted_at: null },
    });

    if (!comment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Comment not found',
      });
    }

    if (comment.author_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the author can update this comment',
      });
    }

    const updated = await this.prisma.comments.update({
      where: { id },
      data: { content: dto.content },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            first_name: true,
            last_name: true,
            profile_picture_url: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      postId: updated.post_id,
      parentCommentId: updated.parent_comment_id,
      content: updated.content,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      author: updated.author,
    };
  }

  /**
   * Soft delete comment (Author OR Community Admin/Mod/Owner via CASL)
   */
  async softDelete(id: string, userId: string): Promise<{ success: true }> {
    const comment = await this.prisma.comments.findFirst({
      where: { id, deleted_at: null },
      include: {
        post: {
          select: {
            community_id: true,
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Comment not found',
      });
    }

    // Check CASL permissions using raw subject attributes
    const userCommunityRoles = await this.caslAbilityFactory.getUserCommunityRoles(userId);
    const ability = this.caslAbilityFactory.createForUser({ id: userId }, userCommunityRoles);

    const commentSubject = subject('Comment', {
      author_id: comment.author_id,
      community_id: comment.post.community_id,
    } as any);

    if (!ability.can('delete', commentSubject)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission to delete this comment',
      });
    }

    await this.prisma.comments.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Toggle reaction (like) on a comment
   */
  async toggleReaction(id: string, userId: string) {
    const comment = await this.prisma.comments.findFirst({
      where: { id, deleted_at: null },
      include: {
        post: {
          include: {
            community: true,
          },
        },
      },
    });

    if (!comment || comment.post.deleted_at !== null || comment.post.community.deleted_at !== null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Comment not found',
      });
    }

    // Private community gate
    if (comment.post.community.is_private) {
      const isOwner = comment.post.community.creator_id === userId;
      if (!isOwner) {
        const membership = await this.prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: comment.post.community.id,
              user_id: userId,
            },
          },
        });

        if (!membership) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'Membership required to react to this comment',
          });
        }
      }
    }

    const existing = await this.prisma.comment_reactions.findUnique({
      where: {
        comment_id_user_id: {
          comment_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      await this.prisma.comment_reactions.delete({
        where: {
          comment_id_user_id: {
            comment_id: id,
            user_id: userId,
          },
        },
      });
    } else {
      await this.prisma.comment_reactions.create({
        data: {
          comment_id: id,
          user_id: userId,
        },
      });
    }

    const reactionCount = await this.prisma.comment_reactions.count({
      where: { comment_id: id },
    });

    return {
      reacted: !existing,
      reactionCount,
    };
  }
}
