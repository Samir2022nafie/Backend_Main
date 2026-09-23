import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import {
  CreateCommunityDto,
  UpdateCommunityDto,
  CommunityQueryDto,
  ListMembersQueryDto,
  UpdateMemberRoleDto,
} from './dto';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';
import { ErrorCode } from '@/core/common/enums';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new community and automatically make creator an admin member
   */
  async create(userId: string, dto: CreateCommunityDto) {
    // 1. Validate category existence
    const category = await this.prisma.categories.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Category does not exist',
      });
    }

    // 2. Validate slug uniqueness among non-deleted communities
    const existing = await this.prisma.communities.findUnique({
      where: { slug: dto.slug },
    });
    if (existing && existing.deleted_at === null) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'A community with this slug already exists',
      });
    }

    // 3. Atomically create community & admin membership
    return this.prisma.$transaction(async (tx) => {
      const community = await tx.communities.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          rules: dto.rules,
          creator_id: userId,
          category_id: dto.categoryId,
          location_id: dto.locationId,
          banner_url: dto.bannerUrl ? await resolveDirectImageUrl(dto.bannerUrl) : null,
          profile_picture_url: dto.profilePictureUrl ? await resolveDirectImageUrl(dto.profilePictureUrl) : null,
          is_private: dto.isPrivate ?? false,
        },
        include: {
          category: true,
          location: true,
        },
      });

      await tx.community_members.create({
        data: {
          community_id: community.id,
          user_id: userId,
          role: 'admin',
        },
      });

      return community;
    });
  }

  /**
   * List public communities with pagination, search, category filter, and membership status
   */
  async findAll(query: CommunityQueryDto, currentUserId?: string) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      deleted_at: null,
    };

    if (query.categoryId) {
      where.category_id = query.categoryId;
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // Privacy filter
    if (!currentUserId) {
      where.is_private = false;
    } else {
      where.AND = [
        {
          OR: [
            { is_private: false },
            { members: { some: { user_id: currentUserId } } },
          ],
        },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.communities.count({ where }),
      this.prisma.communities.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          category: true,
          location: true,
          _count: {
            select: { members: true },
          },
          ...(currentUserId
            ? {
                members: {
                  where: { user_id: currentUserId },
                  select: { role: true },
                },
              }
            : {}),
        },
      }),
    ]);

    const formatted = items.map((c) => {
      const isMember = currentUserId ? c.members && c.members.length > 0 : false;
      const myRole = isMember
        ? c.creator_id === currentUserId
          ? 'owner'
          : c.members[0].role
        : null;
      const { members, _count, ...rest } = c;
      return {
        ...rest,
        memberCount: _count.members,
        isMember,
        myRole,
      };
    });

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
   * Get single community by slug with privacy gating
   */
  async findBySlug(slug: string, currentUserId?: string) {
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);
    const community = await this.prisma.communities.findFirst({
      where: {
        ...(isUuid ? { OR: [{ slug }, { id: slug }] } : { slug }),
        deleted_at: null,
      },
      include: {
        category: true,
        location: true,
        _count: {
          select: { members: true },
        },
      },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    let membership: any = null;
    if (currentUserId) {
      membership = await this.prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: community.id,
            user_id: currentUserId,
          },
        },
      });
    }

    if (community.is_private && !membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This community is private. You must be an active member to view its content.',
      });
    }

    const isMember = !!membership;
    const myRole = isMember
      ? community.creator_id === currentUserId
        ? 'owner'
        : membership.role
      : null;

    const { _count, ...rest } = community;
    return {
      ...rest,
      memberCount: _count.members,
      isMember,
      myRole,
    };
  }

  /**
   * Update community settings (Owner only)
   */
  async update(slug: string, userId: string, dto: UpdateCommunityDto) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    if (community.creator_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the community owner can update settings',
      });
    }

    const resolvedBanner = dto.bannerUrl !== undefined ? (dto.bannerUrl ? await resolveDirectImageUrl(dto.bannerUrl) : null) : undefined;
    const resolvedAvatar = dto.profilePictureUrl !== undefined ? (dto.profilePictureUrl ? await resolveDirectImageUrl(dto.profilePictureUrl) : null) : undefined;

    return this.prisma.communities.update({
      where: { id: community.id },
      data: {
        name: dto.name,
        description: dto.description,
        rules: dto.rules,
        banner_url: resolvedBanner,
        profile_picture_url: resolvedAvatar,
        is_private: dto.isPrivate,
      },
    });
  }

  /**
   * Soft delete community (Owner only)
   */
  async softDelete(slug: string, userId: string): Promise<{ success: true }> {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    if (community.creator_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the community owner can delete this community',
      });
    }

    await this.prisma.communities.update({
      where: { id: community.id },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Join a public community
   */
  async join(slug: string, userId: string) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    if (community.is_private) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Direct join is disabled for private communities. Invitation or request required.',
      });
    }

    const existingMember = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'You are already a member of this community',
      });
    }

    const member = await this.prisma.community_members.create({
      data: {
        community_id: community.id,
        user_id: userId,
        role: 'member',
      },
    });

    // Notify community owners and admins of the new member
    try {
      const adminMembers = await this.prisma.community_members.findMany({
        where: {
          community_id: community.id,
          role: 'admin',
          user_id: { not: userId },
        },
        select: { user_id: true },
      });

      const recipientIds = new Set<string>();
      if (community.creator_id && community.creator_id !== userId) {
        recipientIds.add(community.creator_id);
      }
      adminMembers.forEach((m) => recipientIds.add(m.user_id));

      if (recipientIds.size > 0) {
        const joiner = await this.prisma.users.findUnique({
          where: { id: userId },
          select: { first_name: true, last_name: true, name: true, username: true },
        });
        const joinerName = joiner?.first_name
          ? `${joiner.first_name} ${joiner.last_name || ''}`.trim()
          : joiner?.name || (joiner?.username ? `@${joiner.username}` : 'A new member');

        await this.prisma.notifications.createMany({
          data: Array.from(recipientIds).map((targetId) => ({
            user_id: targetId,
            type: 'mention' as const,
            title: 'New Community Member',
            message: `${joinerName} has joined your community "${community.name}".`,
            related_entity_type: 'community',
            related_entity_id: community.id,
          })),
        });
      }
    } catch {}

    return member;
  }

  /**
   * Leave community (with owner protection)
   */
  async leave(slug: string, userId: string): Promise<{ success: true }> {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Owner protection invariant: owner cannot leave without transferring ownership
    if (community.creator_id === userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Community owner cannot leave without transferring ownership first',
      });
    }

    await this.prisma.community_members.delete({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: userId,
        },
      },
    });

    return { success: true };
  }

  /**
   * List community members with roles (Admin / Mod / Owner only)
   */
  async listMembers(slug: string, callerId: string, query: ListMembersQueryDto) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Role check: caller must be owner, admin, or moderator of this community
    const isOwner = community.creator_id === callerId;
    if (!isOwner) {
      const callerMembership = await this.prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: community.id,
            user_id: callerId,
          },
        },
      });

      if (!callerMembership || (callerMembership.role !== 'admin' && callerMembership.role !== 'moderator')) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Only community administrators, moderators, and the owner can view members with roles',
        });
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      community_id: community.id,
      user: {
        deleted_at: null,
      },
    };

    if (query.role) {
      where.role = query.role;
    }

    if (query.q) {
      where.user = {
        deleted_at: null,
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.community_members.count({ where }),
      this.prisma.community_members.findMany({
        where,
        skip,
        take: limit,
        orderBy: { joined_at: 'desc' },
        include: {
          user: {
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
      }),
    ]);

    const formatted = items.map((m) => {
      const isMemberOwner = community.creator_id === m.user_id;
      return {
        userId: m.user_id,
        role: isMemberOwner ? 'owner' : m.role,
        joinedAt: m.joined_at,
        appointedAt: m.appointed_at,
        appointedBy: m.appointed_by,
        user: m.user,
      };
    });

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
   * Update member role (Owner only; cannot target owner)
   */
  async updateMemberRole(
    slug: string,
    callerId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Role check: strictly OWNER only
    if (community.creator_id !== callerId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the community owner can update member roles',
      });
    }

    // Owner protection invariant: cannot alter owner role
    if (community.creator_id === targetUserId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot alter community owner role',
      });
    }

    const existingMembership = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
    });

    if (!existingMembership) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Target user is not a member of this community',
      });
    }

    return this.prisma.community_members.update({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
      data: {
        role: dto.role,
        appointed_by: callerId,
        appointed_at: new Date(),
      },
    });
  }

  /**
   * Kick member from community (Admin / Mod / Owner; cannot target owner)
   */
  async kickMember(slug: string, callerId: string, targetUserId: string): Promise<{ success: true }> {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Role check: caller must be owner, admin, or moderator of this community
    const isOwner = community.creator_id === callerId;
    if (!isOwner) {
      const callerMembership = await this.prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: community.id,
            user_id: callerId,
          },
        },
      });

      if (!callerMembership || (callerMembership.role !== 'admin' && callerMembership.role !== 'moderator')) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Only community administrators, moderators, and the owner can kick members',
        });
      }
    }

    // Owner protection invariant: owner cannot be kicked
    if (community.creator_id === targetUserId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Community owner cannot be kicked from their own community',
      });
    }

    const existingMembership = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
    });

    if (!existingMembership) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Target user is not a member of this community',
      });
    }

    await this.prisma.community_members.delete({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
    });

    return { success: true };
  }
}
