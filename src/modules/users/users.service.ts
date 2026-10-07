import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { SessionService } from '@/modules/auth/session.service';
import { LocationsService } from '@/modules/locations/locations.service';
import { UpdateUserDto } from './dto';
import { ErrorCode } from '@/core/common/enums';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly locationsService: LocationsService,
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
      include: {
        location: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User profile not found',
      });
    }

    const sanitized = this.sanitizeUser(user);
    return {
      ...sanitized,
      isLocationPrivate: user.is_location_private,
      is_location_private: user.is_location_private,
      location: user.location
        ? {
            id: user.location.id,
            name: user.location.place_name,
            placeName: user.location.place_name,
            place_name: user.location.place_name,
            latitude: Number(user.location.latitude),
            longitude: Number(user.location.longitude),
          }
        : null,
    };
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
    const lastName = dto.lastName !== undefined ? dto.lastName : existing.last_name;
    const fullName = `${firstName} ${lastName || ''}`.trim();

    const resolvedPic =
      dto.profilePictureUrl !== undefined
        ? dto.profilePictureUrl && dto.profilePictureUrl.trim()
          ? dto.profilePictureUrl.trim().startsWith('data:image/')
            ? dto.profilePictureUrl.trim()
            : await resolveDirectImageUrl(dto.profilePictureUrl.trim())
          : null
        : undefined;

    let locationIdToSet = existing.location_id;
    if (
      dto.locationId !== undefined ||
      dto.locationName !== undefined ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined
    ) {
      const isExplicitNewLocationId = Boolean(dto.locationId && dto.locationId !== existing.location_id);
      const targetLocationId = isExplicitNewLocationId ? dto.locationId : undefined;

      // If user cleared the location (empty name and no coordinates or explicit ID)
      const hasNoCoords =
        (dto.latitude === null || dto.latitude === undefined) &&
        (dto.longitude === null || dto.longitude === undefined);
      const hasEmptyName = dto.locationName === null || (typeof dto.locationName === 'string' && dto.locationName.trim() === '');

      if (hasEmptyName && hasNoCoords && !isExplicitNewLocationId) {
        locationIdToSet = null;
      } else {
        // Check if user already has this exact location
        const currentLocation = existing.location_id
          ? await this.prisma.locations.findUnique({ where: { id: existing.location_id } })
          : null;

        const isSameCoords =
          currentLocation &&
          dto.latitude !== undefined &&
          dto.latitude !== null &&
          dto.longitude !== undefined &&
          dto.longitude !== null &&
          Math.abs(Number(currentLocation.latitude) - Number(dto.latitude)) < 0.0001 &&
          Math.abs(Number(currentLocation.longitude) - Number(dto.longitude)) < 0.0001;

        if (isSameCoords && currentLocation) {
          // Same coordinates; update place name if user edited it
          if (dto.locationName && dto.locationName.trim() && currentLocation.place_name !== dto.locationName.trim()) {
            await this.prisma.locations.update({
              where: { id: currentLocation.id },
              data: { place_name: dto.locationName.trim() },
            });
          }
          locationIdToSet = currentLocation.id;
        } else {
          locationIdToSet = await this.locationsService.resolveLocation({
            locationId: targetLocationId,
            locationName: dto.locationName,
            latitude: dto.latitude,
            longitude: dto.longitude,
          });
        }
      }
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName !== undefined ? (dto.lastName || null) : undefined,
        name: fullName,
        bio: dto.bio,
        profile_picture_url: resolvedPic,
        location_id: locationIdToSet,
        is_location_private: dto.isLocationPrivate !== undefined ? dto.isLocationPrivate : undefined,
      },
      include: {
        location: true,
      },
    });

    const sanitized = this.sanitizeUser(updated);
    return {
      ...sanitized,
      isLocationPrivate: updated.is_location_private,
      is_location_private: updated.is_location_private,
      location: updated.location
        ? {
            id: updated.location.id,
            name: updated.location.place_name,
            placeName: updated.location.place_name,
            place_name: updated.location.place_name,
            latitude: Number(updated.location.latitude),
            longitude: Number(updated.location.longitude),
          }
        : null,
    };
  }

  /**
   * Soft-delete user account:
   * - Scramble username so the original can be reused
   * - Null out email & phone so they can be re-registered
   * - Delete external account links
   * - Invalidate all active sessions
   */
  async softDelete(userId: string, ticket?: string): Promise<{ success: true }> {
    if (ticket) {
      const record = await this.prisma.verification.findFirst({
        where: {
          identifier: `security-ticket:delete-account:${userId}`,
          value: ticket,
          expires_at: { gt: new Date() },
        },
      });

      if (!record) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Security verification session expired or invalid. Please verify again.',
        });
      }

      await this.prisma.verification.delete({ where: { id: record.id } });
    }

    const shortId = userId.slice(0, 8);
    const timestamp = Date.now();

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        deleted_at: new Date(),
        username: `deleted_${shortId}_${timestamp}`,
        email: null,
        phone_number: null,
        phone_verified_at: null,
        phone_number_verified: false,
      },
    });

    // Remove all external account links (credential, oauth, etc.)
    await this.prisma.user_external_accounts.deleteMany({
      where: { user_id: userId },
    });

    // Invalidate all sessions
    await this.sessionService.revokeAllUserSessions(userId);

    return { success: true };
  }

  /**
   * Get public profile with block hiding and follow status (supports UUID or username)
   */
  async getPublicProfile(targetUserId: string, currentUserId?: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId);
    const userWhere: any = isUuid
      ? { id: targetUserId, deleted_at: null }
      : { username: targetUserId, deleted_at: null };

    const user = await this.prisma.users.findFirst({
      where: userWhere,
      include: {
        location: true,
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

    const resolvedUserId = user.id;

    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: resolvedUserId },
            { blocker_id: resolvedUserId, blocked_id: currentUserId },
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
    if (currentUserId && currentUserId !== resolvedUserId) {
      const follow = await this.prisma.user_follows.findUnique({
        where: {
          follower_id_following_id: {
            follower_id: currentUserId,
            following_id: resolvedUserId,
          },
        },
      });
      isFollowing = !!follow;
    }

    const isSelf = currentUserId === resolvedUserId;
    const isHidden = user.is_location_private && !isSelf;

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
      trust_score: user.trust_score ?? 50,
      trustScore: user.trust_score ?? 50,
      isLocationPrivate: user.is_location_private,
      is_location_private: user.is_location_private,
      location: !isHidden && user.location
        ? {
            id: user.location.id,
            name: user.location.place_name,
            placeName: user.location.place_name,
            latitude: Number(user.location.latitude),
            longitude: Number(user.location.longitude),
          }
        : null,
    };
  }

  /**
   * Get followers of current user with follow-back status and optional search
   */
  async getMyFollowers(currentUserId: string, search?: string) {
    const where: any = {
      following_id: currentUserId,
      follower: {
        deleted_at: null,
      },
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.follower.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { first_name: { contains: q, mode: 'insensitive' } },
        { last_name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const followers = await this.prisma.user_follows.findMany({
      where,
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            name: true,
            first_name: true,
            last_name: true,
            bio: true,
            profile_picture_url: true,
            trust_score: true,
          },
        },
      },
      orderBy: { followed_at: 'desc' },
    });

    const followerList = followers as any[];
    const followerIds = followerList.map((f) => f.follower_id);
    const followingBack = await this.prisma.user_follows.findMany({
      where: {
        follower_id: currentUserId,
        following_id: { in: followerIds },
      },
      select: { following_id: true },
    });
    const followingBackSet = new Set(followingBack.map((f) => f.following_id));

    return followerList.map((f) => ({
      id: f.follower?.id || f.follower_id,
      username: f.follower?.username || '',
      name: f.follower?.name || '',
      firstName: f.follower?.first_name || '',
      lastName: f.follower?.last_name || '',
      bio: f.follower?.bio || null,
      profilePictureUrl: f.follower?.profile_picture_url || null,
      trustScore: f.follower?.trust_score ?? 50,
      isFollowing: followingBackSet.has(f.follower_id),
    }));
  }

  /**
   * Remove a follower from current user's followers
   */
  async removeFollower(followerUserId: string, currentUserId: string) {
    await this.prisma.user_follows.deleteMany({
      where: {
        follower_id: followerUserId,
        following_id: currentUserId,
      },
    });
    return { success: true, removed: true };
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
   * Get public posts authored by a user (supports UUID or username)
   */
  async getUserPosts(targetUserId: string, currentUserId?: string) {
    let resolvedUserId = targetUserId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId);
    if (!isUuid) {
      const u = await this.prisma.users.findFirst({
        where: { username: targetUserId, deleted_at: null },
        select: { id: true },
      });
      if (!u) return [];
      resolvedUserId = u.id;
    }

    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: resolvedUserId },
            { blocker_id: resolvedUserId, blocked_id: currentUserId },
          ],
        },
      });
      if (block) return [];
    }

    const posts = await this.prisma.posts.findMany({
      where: {
        author_id: resolvedUserId,
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
        tags: {
          include: {
            tag: true,
          },
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            profile_picture_url: true,
            banner_url: true,
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
              saved_by: { where: { user_id: currentUserId } },
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
      community: p.community
        ? {
            id: p.community.id,
            name: p.community.name,
            slug: p.community.slug,
            category: p.community.category,
            profile_picture_url: p.community.profile_picture_url,
            profilePictureUrl: p.community.profile_picture_url,
            banner_url: p.community.banner_url,
            bannerUrl: p.community.banner_url,
          }
        : null,
      communityName: p.community?.name,
      communitySlug: p.community?.slug,
      communityCategory: p.community?.category,
      communityAvatar: p.community?.profile_picture_url,
      communityProfilePictureUrl: p.community?.profile_picture_url,
      communityBanner: p.community?.banner_url,
      communityBannerUrl: p.community?.banner_url,
      author: p.author,
      authorId: p.author_id,
      author_id: p.author_id,
      authorName: p.author
        ? `${p.author.first_name || ''} ${p.author.last_name || ''}`.trim() || p.author.name || p.author.username
        : 'Unknown',
      authorAvatar: p.author?.profile_picture_url,
      tags: p.tags ? p.tags.map((t: any) => t.tag?.name || t.name || t) : [],
      likesCount: p._count.reactions,
      reactionCount: p._count.reactions,
      commentsCount: p._count.comments,
      commentCount: p._count.comments,
      hasReacted: currentUserId && Array.isArray(p.reactions) ? p.reactions.length > 0 : false,
      isLiked: currentUserId && Array.isArray(p.reactions) ? p.reactions.length > 0 : false,
      hasSaved: currentUserId && Array.isArray(p.saved_by) ? p.saved_by.length > 0 : false,
      isSaved: currentUserId && Array.isArray(p.saved_by) ? p.saved_by.length > 0 : false,
      createdAt: p.created_at,
      created_at: p.created_at,
      updatedAt: p.updated_at,
      updated_at: p.updated_at,
      isEdited: Boolean(p.updated_at && p.created_at && (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 2000)),
      is_edited: Boolean(p.updated_at && p.created_at && (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 2000)),
    }));
  }

  /**
   * Get public communities a user is a member of (supports UUID or username)
   */
  async getUserCommunities(targetUserId: string, currentUserId?: string) {
    let resolvedUserId = targetUserId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId);
    if (!isUuid) {
      const u = await this.prisma.users.findFirst({
        where: { username: targetUserId, deleted_at: null },
        select: { id: true },
      });
      if (!u) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'User not found',
        });
      }
      resolvedUserId = u.id;
    }

    if (currentUserId) {
      const block = await this.prisma.user_blocks.findFirst({
        where: {
          OR: [
            { blocker_id: currentUserId, blocked_id: resolvedUserId },
            { blocker_id: resolvedUserId, blocked_id: currentUserId },
          ],
        },
      });
      if (block) return [];
    }

    const memberships = await this.prisma.community_members.findMany({
      where: {
        user_id: resolvedUserId,
        community: {
          deleted_at: null,
        },
      },
      include: {
        community: {
          include: {
            category: true,
            _count: {
              select: {
                members: true,
                events: { where: { deleted_at: null } },
                posts: { where: { deleted_at: null } },
              },
            },
            ...(currentUserId
              ? {
                  members: {
                    where: { user_id: currentUserId },
                  },
                }
              : {}),
          },
        },
      },
      orderBy: { joined_at: 'desc' },
    });

    return memberships.map((m: any) => {
      const c = m.community;
      const isViewerMember = currentUserId && Array.isArray(c.members) ? c.members.length > 0 : false;
      const viewerRole = isViewerMember ? c.members[0].role : null;

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        bannerUrl: c.banner_url,
        banner_url: c.banner_url,
        profilePictureUrl: c.profile_picture_url,
        profile_picture_url: c.profile_picture_url,
        isPrivate: c.is_private,
        is_private: c.is_private,
        category: c.category?.name || 'General',
        memberCount: c._count.members,
        postCount: c._count.posts,
        eventCount: c._count.events,
        userRole: m.role,
        joinedAt: m.joined_at,
        isMember: isViewerMember,
        viewerRole,
      };
    });
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
