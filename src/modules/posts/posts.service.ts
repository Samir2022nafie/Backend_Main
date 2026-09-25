import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { subject } from '@casl/ability';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { ErrorCode } from '@/core/common/enums';
import {
  CreatePostDto,
  UpdatePostDto,
  PostQueryDto,
} from './dto';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Create a new post in a community (Member+ only)
   */
  async create(communitySlug: string, userId: string, dto: CreatePostDto) {
    const community = await this.prisma.communities.findFirst({
      where: { slug: communitySlug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Role check: caller must be an active member or owner
    const isOwner = community.creator_id === userId;
    let isMember = isOwner;

    if (!isMember) {
      const membership = await this.prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: community.id,
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
        message: 'Only community members can create posts',
      });
    }

    // Auto-create/upsert tags
    const tagRecords: { id: string; name: string }[] = [];
    if (dto.tags && dto.tags.length > 0) {
      for (const rawTag of dto.tags) {
        const name = rawTag.trim().toLowerCase();
        if (name) {
          const tag = await this.prisma.tags.upsert({
            where: { name },
            create: { name },
            update: {},
          });
          tagRecords.push(tag);
        }
      }
    }

    const resolvedMediaUrl = dto.mediaUrl && dto.mediaUrl.trim() ? await resolveDirectImageUrl(dto.mediaUrl.trim()) : null;

    const post = await this.prisma.posts.create({
      data: {
        community_id: community.id,
        author_id: userId,
        title: dto.title ?? null,
        content: dto.content ?? null,
        media_url: resolvedMediaUrl,
        tags:
          tagRecords.length > 0
            ? {
                create: tagRecords.map((t) => ({ tag_id: t.id })),
              }
            : undefined,
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
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return {
      id: post.id,
      communityId: post.community_id,
      title: post.title,
      content: post.content,
      mediaUrl: post.media_url,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      author: post.author,
      tags: post.tags.map((t) => t.tag.name),
      reactionCount: 0,
      hasReacted: false,
      hasSaved: false,
      commentCount: 0,
    };
  }

  /**
   * List posts in a community (respects privacy, block filtering, tags, pagination)
   */
  async findAll(communitySlug: string, query: PostQueryDto, userId?: string) {
    const community = await this.prisma.communities.findFirst({
      where: { slug: communitySlug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Privacy gate: private communities require authentication & membership
    if (community.is_private) {
      if (!userId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This community is private. Authentication required.',
        });
      }

      const isOwner = community.creator_id === userId;
      if (!isOwner) {
        const membership = await this.prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: community.id,
              user_id: userId,
            },
          },
        });

        if (!membership) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'This community is private. Membership required to view posts.',
          });
        }
      }
    }

    // Block filtering: exclude posts from blocked users or users who blocked caller
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
      community_id: community.id,
      deleted_at: null,
      author: {
        deleted_at: null,
      },
    };

    if (blockedUserIds.length > 0) {
      where.author_id = { notIn: blockedUserIds };
    }

    if (query.tag) {
      where.tags = {
        some: {
          tag: {
            name: query.tag.trim().toLowerCase(),
          },
        },
      };
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { content: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    if (query.sort === 'popular') {
      orderBy.reactions = { _count: query.order || 'desc' };
    } else {
      orderBy.created_at = query.order || 'desc';
    }

    const [total, items] = await Promise.all([
      this.prisma.posts.count({ where }),
      this.prisma.posts.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
          tags: {
            include: {
              tag: true,
            },
          },
          _count: {
            select: {
              reactions: true,
              comments: { where: { deleted_at: null } },
            },
          },
          ...(userId
            ? {
                reactions: { where: { user_id: userId } },
                saved_by: { where: { user_id: userId } },
              }
            : {}),
        },
      }),
    ]);

    const formatted = items.map((p: any) => ({
      id: p.id,
      communityId: p.community_id,
      title: p.title,
      content: p.content,
      mediaUrl: p.media_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      isEdited: Boolean(p.updated_at && p.created_at && (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 2000)),
      is_edited: Boolean(p.updated_at && p.created_at && (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 2000)),
      author: p.author,
      tags: p.tags.map((t: any) => t.tag.name),
      reactionCount: p._count.reactions,
      hasReacted: userId ? p.reactions?.length > 0 : false,
      hasSaved: userId ? p.saved_by?.length > 0 : false,
      commentCount: p._count.comments,
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
   * Get single post by ID (privacy, block check, tags, comments)
   */
  async findOne(id: string, userId?: string) {
    const post: any = await this.prisma.posts.findFirst({
      where: { id, deleted_at: null },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            is_private: true,
            creator_id: true,
            profile_picture_url: true,
            banner_url: true,
            deleted_at: true,
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
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            comments: { where: { deleted_at: null } },
          },
        },
        ...(userId
          ? {
              reactions: { where: { user_id: userId } },
              saved_by: { where: { user_id: userId } },
            }
          : {}),
        comments: {
          where: { deleted_at: null, parent_comment_id: null },
          take: 10,
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
            _count: {
              select: { replies: { where: { deleted_at: null } } },
            },
          },
        },
      },
    });

    if (!post || post.community.deleted_at !== null || post.author.deleted_at !== null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Block check
    if (userId) {
      const blockExists = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: userId, blocked_id: post.author_id },
            { blocker_id: post.author_id, blocked_id: userId },
          ],
        },
      });

      if (blockExists) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Post not found',
        });
      }
    }

    // Privacy check
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
            message: 'This community is private. Membership required to view post.',
          });
        }
      }
    }

    return {
      id: post.id,
      community: {
        id: post.community.id,
        name: post.community.name,
        slug: post.community.slug,
        profile_picture_url: post.community.profile_picture_url,
        banner_url: post.community.banner_url,
      },
      title: post.title,
      content: post.content,
      mediaUrl: post.media_url,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      isEdited: Boolean(post.updated_at && post.created_at && (new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000)),
      is_edited: Boolean(post.updated_at && post.created_at && (new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000)),
      author: {
        id: post.author.id,
        username: post.author.username,
        name: post.author.name,
        first_name: post.author.first_name,
        last_name: post.author.last_name,
        profile_picture_url: post.author.profile_picture_url,
      },
      tags: post.tags.map((t: any) => t.tag.name),
      reactionCount: post._count.reactions,
      hasReacted: userId ? post.reactions?.length > 0 : false,
      hasSaved: userId ? post.saved_by?.length > 0 : false,
      commentCount: post._count.comments,
      comments: post.comments.map((c: any) => ({
        id: c.id,
        content: c.content,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        author: c.author,
        replyCount: c._count.replies,
      })),
    };
  }

  /**
   * Update post (Author only)
   */
  async update(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.posts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    if (post.author_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the author can update this post',
      });
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.mediaUrl !== undefined) {
      updateData.media_url = dto.mediaUrl && dto.mediaUrl.trim() ? await resolveDirectImageUrl(dto.mediaUrl.trim()) : null;
    }

    if (dto.tags !== undefined) {
      // Remove previous tags
      await this.prisma.post_tags.deleteMany({
        where: { post_id: id },
      });

      if (dto.tags.length > 0) {
        const tagRecords: { id: string; name: string }[] = [];
        for (const rawTag of dto.tags) {
          const name = rawTag.trim().toLowerCase();
          if (name) {
            const tag = await this.prisma.tags.upsert({
              where: { name },
              create: { name },
              update: {},
            });
            tagRecords.push(tag);
          }
        }
        updateData.tags = {
          create: tagRecords.map((t) => ({ tag_id: t.id })),
        };
      }
    }

    const updated = await this.prisma.posts.update({
      where: { id },
      data: updateData,
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
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      communityId: updated.community_id,
      title: updated.title,
      content: updated.content,
      mediaUrl: updated.media_url,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      isEdited: true,
      is_edited: true,
      author: updated.author,
      tags: updated.tags.map((t) => t.tag.name),
    };
  }

  /**
   * Soft delete post (Author OR Admin/Mod/Owner of the community via CASL + DB)
   */
  async softDelete(id: string, userId: string): Promise<{ success: true }> {
    const post = await this.prisma.posts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Check CASL permissions using raw Prisma row unmodified
    const userCommunityRoles = await this.caslAbilityFactory.getUserCommunityRoles(userId);
    const ability = this.caslAbilityFactory.createForUser({ id: userId }, userCommunityRoles);

    const postSubject = subject('Post', {
      author_id: post.author_id,
      community_id: post.community_id,
    } as any);

    if (!ability.can('delete', postSubject)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission to delete this post',
      });
    }

    await this.prisma.posts.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Toggle reaction (like) on post
   */
  async toggleReaction(id: string, userId: string) {
    const post = await this.prisma.posts.findFirst({
      where: { id, deleted_at: null },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Private community gate
    if (post.community.is_private) {
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
            message: 'Membership required to react to this post',
          });
        }
      }
    }

    const existing = await this.prisma.post_reactions.findUnique({
      where: {
        post_id_user_id: {
          post_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      await this.prisma.post_reactions.delete({
        where: {
          post_id_user_id: {
            post_id: id,
            user_id: userId,
          },
        },
      });
    } else {
      await this.prisma.post_reactions.create({
        data: {
          post_id: id,
          user_id: userId,
        },
      });

      if (post.author_id !== userId) {
        const reactor = await this.prisma.users.findUnique({
          where: { id: userId },
          select: { name: true, first_name: true, username: true },
        });
        const reactorName = reactor?.first_name || reactor?.name || reactor?.username || 'Someone';
        await this.prisma.notifications.create({
          data: {
            user_id: post.author_id,
            type: 'post_reaction',
            title: 'New Like on your post',
            message: `${reactorName} liked your post "${post.title || 'Untitled'}"`,
            related_entity_type: 'post',
            related_entity_id: post.id,
          },
        }).catch(() => null);
      }
    }

    const reactionCount = await this.prisma.post_reactions.count({
      where: { post_id: id },
    });

    return {
      reacted: !existing,
      reactionCount,
    };
  }

  /**
   * Toggle save (bookmark) on post
   */
  async toggleSave(id: string, userId: string) {
    const post = await this.prisma.posts.findFirst({
      where: { id, deleted_at: null },
      include: { community: true },
    });

    if (!post) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Post not found',
      });
    }

    // Private community gate
    if (post.community.is_private) {
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
            message: 'Membership required to save this post',
          });
        }
      }
    }

    const existing = await this.prisma.saved_posts.findUnique({
      where: {
        user_id_post_id: {
          user_id: userId,
          post_id: id,
        },
      },
    });

    if (existing) {
      await this.prisma.saved_posts.delete({
        where: {
          user_id_post_id: {
            user_id: userId,
            post_id: id,
          },
        },
      });
      return { saved: false };
    } else {
      await this.prisma.saved_posts.create({
        data: {
          user_id: userId,
          post_id: id,
        },
      });
      return { saved: true };
    }
  }
}
