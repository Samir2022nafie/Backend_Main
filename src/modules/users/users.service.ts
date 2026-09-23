import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { SessionService } from '@/modules/auth/session.service';
import { UpdateUserDto } from './dto';
import { ErrorCode } from '@/core/common/enums';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Return all communities where the user is an owner, admin, or moderator
   */
  async findManagedCommunities(userId: string) {
    const memberships = await this.prisma.community_members.findMany({
      where: {
        user_id: userId,
        role: { in: ['admin', 'moderator'] },
        community: { deleted_at: null },
      },
      include: {
        community: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });

    return memberships.map((m) => {
      const c = m.community;
      const isOwner = c.creator_id === userId;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        bannerUrl: c.banner_url,
        profilePictureUrl: c.profile_picture_url,
        isPrivate: c.is_private,
        memberCount: c._count.members,
        role: isOwner ? 'owner' : m.role,
      };
    });
  }

  /**
   * Return the profile of the authenticated user
   */
  async getProfile(userId: string) {
    const user = await this.prisma.users.findFirst({
      where: {
        id: userId,
        deleted_at: null,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User profile not found',
      });
    }

    return this.sanitizeUser(user);
  }

  /**
   * Update profile fields of the authenticated user
   */
  async updateProfile(userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User profile not found',
      });
    }

    const firstName = dto.firstName ?? existing.first_name;
    const lastName = dto.lastName ?? existing.last_name;
    const fullName = `${firstName} ${lastName}`.trim();

    const resolvedPic = dto.profilePictureUrl !== undefined
      ? (dto.profilePictureUrl && dto.profilePictureUrl.trim() ? await resolveDirectImageUrl(dto.profilePictureUrl.trim()) : null)
      : undefined;

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName,
        name: fullName,
        bio: dto.bio,
        profile_picture_url: resolvedPic,
      },
    });

    return this.sanitizeUser(updated);
  }

  /**
   * Soft-delete user account and invalidate all active sessions
   */
  async softDelete(userId: string): Promise<{ success: true }> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { deleted_at: new Date() },
    });

    await this.sessionService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * Get public profile with block hiding and follow status
   */
  async getPublicProfile(targetUserId: string, currentUserId?: string) {
    const user = await this.prisma.users.findFirst({
      where: { id: targetUserId, deleted_at: null },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            community_memberships: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: targetUserId },
            { blocker_id: targetUserId, blocked_id: currentUserId },
          ],
        },
      });

      if (block) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'User not found',
        });
      }
    }

    let isFollowing = false;
    if (currentUserId && currentUserId !== targetUserId) {
      const follow = await this.prisma.user_follows.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: currentUserId,
            following_id: targetUserId,
          },
        },
      });
      isFollowing = !!follow;
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      firstName: user.first_name,
      lastName: user.last_name,
      bio: user.bio,
      profilePictureUrl: user.profile_picture_url,
      createdAt: user.created_at,
      stats: {
        followersCount: user._count.followers,
        followingCount: user._count.following,
        communitiesCount: user._count.community_memberships,
      },
      isFollowing,
    };
  }

  /**
   * Follow user
   */
  async followUser(targetUserId: string, currentUserId: string) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot follow yourself',
      });
    }

    const targetUser = await this.prisma.users.findFirst({
      where: { id: targetUserId, deleted_at: null },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      });
    }

    const block = await this.prisma.user_blocks.findFirst({
      where: {
        OR: [
          { blocker_id: currentUserId, blocked_id: targetUserId },
          { blocker_id: targetUserId, blocked_id: currentUserId },
        ],
      },
    });

    if (block) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot follow a blocked user or user who blocked you',
      });
    }

    await this.prisma.user_follows.upsert({
      where: {
        follower_id_following_id: {
          follower_id: currentUserId,
          following_id: targetUserId,
        },
      },
      create: {
        follower_id: currentUserId,
        following_id: targetUserId,
      },
      update: {},
    });

    const follower = await this.prisma.users.findUnique({
      where: { id: currentUserId },
      select: { first_name: true, last_name: true, name: true, username: true },
    });
    const followerName = follower?.first_name
      ? `${follower.first_name} ${follower.last_name || ''}`.trim()
      : follower?.name || (follower?.username ? `@${follower.username}` : 'Someone');

    await this.prisma.notifications.create({
      data: {
        user_id: targetUserId,
        type: 'follow',
        title: 'New Follower',
        message: `${followerName} started following you.`,
        related_entity_type: 'user',
        related_entity_id: currentUserId,
      },
    }).catch(() => null);

    return { following: true };
  }

  /**
   * Unfollow user
   */
  async unfollowUser(targetUserId: string, currentUserId: string) {
    await this.prisma.user_follows.deleteMany({
      where: {
        follower_id: currentUserId,
        following_id: targetUserId,
      },
    });

    return { following: false };
  }

  /**
   * Get public posts authored by a user
   */
  async getUserPosts(targetUserId: string, currentUserId?: string) {
    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: targetUserId },
            { blocker_id: targetUserId, blocked_id: currentUserId },
          ],
        },
      });
      if (block) return [];
    }

    const posts = await this.prisma.posts.findMany({
      where: {
        author_id: targetUserId,
        deleted_at: null,
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
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
          },
        },
        _count: {
          select: {
            comments: true,
            reactions: true,
          },
        },
        ...(currentUserId
          ? {
              reactions: { where: { user_id: currentUserId } },
              bookmarks: { where: { user_id: currentUserId } },
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
    });

    return posts.map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      mediaUrl: p.media_url,
      media_url: p.media_url,
      communityId: p.community_id,
      community_id: p.community_id,
      community: p.community,
      communityName: p.community?.name,
      communitySlug: p.community?.slug,
      communityCategory: p.community?.category,
      author: p.author,
      authorId: p.author_id,
      author_id: p.author_id,
      authorName: p.author
        ? `${p.author.first_name || ''} ${p.author.last_name || ''}`.trim() || p.author.name || p.author.username
        : 'Unknown',
      authorAvatar: p.author?.profile_picture_url,
      likesCount: p._count.reactions,
      reactionCount: p._count.reactions,
      commentsCount: p._count.comments,
      commentCount: p._count.comments,
      hasReacted: currentUserId && Array.isArray(p.reactions) ? p.reactions.length > 0 : false,
      isLiked: currentUserId && Array.isArray(p.reactions) ? p.reactions.length > 0 : false,
      hasSaved: currentUserId && Array.isArray(p.bookmarks) ? p.bookmarks.length > 0 : false,
      isSaved: currentUserId && Array.isArray(p.bookmarks) ? p.bookmarks.length > 0 : false,
      createdAt: p.created_at,
      created_at: p.created_at,
    }));
  }

  /**
   * Block user (and mutually unfollow)
   */
  async blockUser(targetUserId: string, currentUserId: string) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot block yourself',
      });
    }

    const targetUser = await this.prisma.users.findFirst({
      where: { id: targetUserId, deleted_at: null },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      });
    }

    await this.prisma.user_blocks.upsert({
      where: {
        blocker_id_blocked_id: {
          blocker_id: currentUserId,
          blocked_id: targetUserId,
        },
      },
      create: {
        blocker_id: currentUserId,
        blocked_id: targetUserId,
      },
      update: {},
    });

    // Mutual unfollow in both directions
    await this.prisma.user_follows.deleteMany({
      where: {
        OR: [
          { follower_id: currentUserId, following_id: targetUserId },
          { follower_id: targetUserId, following_id: currentUserId },
        ],
      },
    });

    return { blocked: true };
  }

  /**
   * Unblock user
   */
  async unblockUser(targetUserId: string, currentUserId: string) {
    await this.prisma.user_blocks.deleteMany({
      where: {
        blocker_id: currentUserId,
        blocked_id: targetUserId,
      },
    });

    return { blocked: false };
  }

  /**
   * Get user trust score and tier
   */
  async getTrustScore(targetUserId: string, currentUserId?: string) {
    const user = await this.prisma.users.findFirst({
      where: { id: targetUserId, deleted_at: null },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: targetUserId },
            { blocker_id: targetUserId, blocked_id: currentUserId },
          ],
        },
      });

      if (block) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'User not found',
        });
      }
    }

    const trustScore = user.trust_score ?? 50;
    let tier: 'Trusted' | 'Member' | 'New' = 'Member';
    if (trustScore >= 80) {
      tier = 'Trusted';
    } else if (trustScore >= 50) {
      tier = 'Member';
    } else {
      tier = 'New';
    }

    return {
      trustScore,
      tier,
    };
  }

  private sanitizeUser(user: any) {
    const { password_hash, ...rest } = user;
    return rest;
  }
}
