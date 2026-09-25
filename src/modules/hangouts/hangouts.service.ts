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
  CreateHangoutDto,
  UpdateHangoutDto,
  HangoutQueryDto,
} from './dto';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';
import {
  RespondHangoutRequestDto,
  BanHangoutUserDto,
} from './dto';

@Injectable()
export class HangoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Helper to resolve community roles for community-tied hangouts
   */
  private async getCommunityRole(communityId: string, creatorId: string, userId?: string) {
    if (!userId) {
      return { isOwner: false, isAdmin: false, isMod: false, isMember: false };
    }

    const isOwner = creatorId === userId;
    if (isOwner) {
      return { isOwner: true, isAdmin: true, isMod: true, isMember: true };
    }

    const member = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: communityId,
          user_id: userId,
        },
      },
    });

    if (!member) {
      return { isOwner: false, isAdmin: false, isMod: false, isMember: false };
    }

    return {
      isOwner: false,
      isAdmin: member.role === 'admin',
      isMod: member.role === 'moderator',
      isMember: true,
    };
  }

  /**
   * Helper to resolve or create a location from locationId or locationName string
   */
  private async resolveLocationId(locationId?: string | null, locationName?: string | null): Promise<string | null> {
    if (locationId) return locationId;
    if (!locationName || !locationName.trim()) return null;

    const trimmed = locationName.trim();
    const existing = await this.prisma.locations.findFirst({
      where: { place_name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) return existing.id;

    const count = await this.prisma.locations.count();
    const lat = 9.010793 + (count * 0.001);
    const lng = 38.761252 + (count * 0.001);

    const created = await this.prisma.locations.create({
      data: {
        place_name: trimmed,
        latitude: lat,
        longitude: lng,
      },
    });
    return created.id;
  }

  /**
   * Create hangout (standalone or community-tied; immediately live)
   */
  async create(userId: string, dto: CreateHangoutDto) {
    let community: any = null;

    if (dto.communityId) {
      community = await this.prisma.communities.findFirst({
        where: { id: dto.communityId, deleted_at: null },
      });

      if (!community) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Community not found',
        });
      }

      const roles = await this.getCommunityRole(community.id, community.creator_id, userId);
      if (!roles.isMember) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Membership required to tie a hangout to this community',
        });
      }
    }

    const resolvedLocationId = await this.resolveLocationId(
      dto.locationId,
      dto.location || dto.locationName
    );

    const hangout = await this.prisma.hangouts.create({
      data: {
        creator_id: userId,
        community_id: dto.communityId ?? null,
        subcommunity_id: dto.subcommunityId ?? null,
        location_id: resolvedLocationId,
        title: dto.title,
        description: dto.description ?? null,
        cover_image_url: dto.coverImageUrl && dto.coverImageUrl.trim() ? await resolveDirectImageUrl(dto.coverImageUrl.trim()) : null,
        starts_at: new Date(dto.startsAt),
        ends_at: dto.endsAt ? new Date(dto.endsAt) : null,
        visibility: dto.visibility ?? 'public',
        join_type: dto.joinType ?? 'open',
        max_participants: dto.maxParticipants ?? null,
      },
      include: {
        creator: {
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
          },
        },
        location: true,
      },
    });

    // Auto-add creator as participant
    await this.prisma.hangout_participants.create({
      data: {
        hangout_id: hangout.id,
        user_id: userId,
      },
    });

    return {
      id: hangout.id,
      communityId: hangout.community_id,
      community: hangout.community,
      title: hangout.title,
      description: hangout.description,
      coverImageUrl: hangout.cover_image_url,
      startsAt: hangout.starts_at,
      endsAt: hangout.ends_at,
      visibility: hangout.visibility,
      joinType: hangout.join_type,
      maxParticipants: hangout.max_participants,
      creator: hangout.creator,
      location: hangout.location,
      participantsCount: 1,
      isParticipant: true,
      isSaved: false,
    };
  }

  /**
   * List public hangouts (respects blocks and soft delete)
   */
  async findAll(query: HangoutQueryDto, userId?: string) {
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
      deleted_at: null,
      visibility: 'public',
      creator: {
        deleted_at: null,
      },
    };

    if (blockedUserIds.length > 0) {
      where.creator_id = { notIn: blockedUserIds };
    }

    const [total, items] = await Promise.all([
      this.prisma.hangouts.count({ where }),
      this.prisma.hangouts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { starts_at: 'asc' },
        include: {
          creator: {
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
            },
          },
          location: true,
          _count: {
            select: {
              participants: true,
            },
          },
          ...(userId
            ? {
                participants: { where: { user_id: userId } },
                saved_by: { where: { user_id: userId } },
                join_requests: { where: { user_id: userId, status: 'pending' } },
              }
            : {}),
        },
      }),
    ]);

    const formatted = items.map((h: any) => ({
      id: h.id,
      creatorId: h.creator_id,
      creator_id: h.creator_id,
      communityId: h.community_id,
      community: h.community,
      title: h.title,
      description: h.description,
      coverImageUrl: h.cover_image_url,
      startsAt: h.starts_at,
      endsAt: h.ends_at,
      visibility: h.visibility,
      joinType: h.join_type,
      maxParticipants: h.max_participants,
      creator: h.creator,
      location: h.location,
      participantsCount: h._count.participants,
      isParticipant: userId ? h.participants?.length > 0 : false,
      hasRequested: userId ? h.join_requests?.length > 0 : false,
      isSaved: userId ? h.saved_by?.length > 0 : false,
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
   * Get single hangout by ID (respects visibility, bans, includes join requests for creator)
   */
  async findOne(id: string, userId?: string) {
    const hangout: any = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
      include: {
        creator: {
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
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            creator_id: true,
            is_private: true,
            deleted_at: true,
          },
        },
        location: true,
        _count: {
          select: {
            participants: true,
          },
        },
        ...(userId
          ? {
              participants: { where: { user_id: userId } },
              saved_by: { where: { user_id: userId } },
            }
          : {}),
      },
    });

    if (
      !hangout ||
      hangout.creator.deleted_at !== null ||
      (hangout.community && hangout.community.deleted_at !== null)
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    // Community visibility / privacy check
    if (hangout.community) {
      const roles = await this.getCommunityRole(
        hangout.community.id,
        hangout.community.creator_id,
        userId,
      );

      if (hangout.community.is_private && !roles.isMember) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This community is private. Authentication required.',
        });
      }

      if (hangout.visibility === 'community' && !roles.isMember) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'This hangout is restricted to community members.',
        });
      }
    }

    // Ban check
    let isBanned = false;
    if (userId) {
      const ban = await this.prisma.hangout_bans.findUnique({
        where: {
          hangout_id_user_id: {
            hangout_id: id,
            user_id: userId,
          },
        },
      });
      isBanned = !!ban;
    }

    // Participants preview (first 20)
    const attendees = await this.prisma.hangout_participants.findMany({
      where: { hangout_id: id },
      take: 20,
      orderBy: { joined_at: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            profile_picture_url: true,
          },
        },
      },
    });

    // Check if caller has requested to join (for request_based)
    let hasRequested = false;
    let joinRequests: any[] | undefined = undefined;

    if (userId) {
      const myRequest = await this.prisma.hangout_join_requests.findUnique({
        where: {
          hangout_id_user_id: {
            hangout_id: id,
            user_id: userId,
          },
        },
      });
      hasRequested = myRequest?.status === 'pending';
    }

    // Creator sees pending requests if request_based
    if (userId === hangout.creator_id && hangout.join_type === 'request_based') {
      const requests = await this.prisma.hangout_join_requests.findMany({
        where: {
          hangout_id: id,
          status: 'pending',
        },
        orderBy: { created_at: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              profile_picture_url: true,
            },
          },
        },
      });
      joinRequests = requests.map((r) => ({
        userId: r.user_id,
        user: r.user,
        status: r.status,
        createdAt: r.created_at,
      }));
    }

    return {
      id: hangout.id,
      creatorId: hangout.creator_id,
      creator_id: hangout.creator_id,
      communityId: hangout.community_id,
      community: hangout.community,
      title: hangout.title,
      description: hangout.description,
      coverImageUrl: hangout.cover_image_url,
      startsAt: hangout.starts_at,
      endsAt: hangout.ends_at,
      visibility: hangout.visibility,
      joinType: hangout.join_type,
      maxParticipants: hangout.max_participants,
      creator: hangout.creator,
      location: hangout.location,
      participantsCount: hangout._count.participants,
      participants: attendees.map((a) => a.user),
      isParticipant: userId ? hangout.participants?.length > 0 : false,
      hasRequested,
      isBanned,
      isSaved: userId ? hangout.saved_by?.length > 0 : false,
      joinRequests,
    };
  }

  /**
   * Update hangout (Creator only)
   */
  async update(id: string, userId: string, dto: UpdateHangoutDto) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    if (hangout.creator_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the creator can update this hangout',
      });
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.coverImageUrl !== undefined) {
      updateData.cover_image_url = dto.coverImageUrl && dto.coverImageUrl.trim() ? await resolveDirectImageUrl(dto.coverImageUrl.trim()) : null;
    }
    if (dto.startsAt !== undefined) updateData.starts_at = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) updateData.ends_at = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    if (dto.joinType !== undefined) updateData.join_type = dto.joinType;
    if (dto.location !== undefined || dto.locationName !== undefined || dto.locationId !== undefined) {
      updateData.location_id = await this.resolveLocationId(dto.locationId, dto.location || dto.locationName);
    }
    if (dto.subcommunityId !== undefined) updateData.subcommunity_id = dto.subcommunityId;
    if (dto.maxParticipants !== undefined) {
      updateData.max_participants = dto.maxParticipants ? Number(dto.maxParticipants) : null;
    }

    const updated = await this.prisma.hangouts.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
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
          },
        },
        location: true,
      },
    });

    // Notify participants and creator about modifications
    try {
      const participants = await this.prisma.hangout_participants.findMany({
        where: { hangout_id: id },
        select: { user_id: true },
      });
      const recipientIds = new Set<string>(participants.map((p) => p.user_id));
      if (hangout.creator_id !== userId) {
        recipientIds.add(hangout.creator_id);
      }
      recipientIds.delete(userId);

      for (const targetUserId of recipientIds) {
        await this.prisma.notifications.create({
          data: {
            user_id: targetUserId,
            type: 'event_reminder',
            title: 'Hangout Updated',
            message: `Details about "${updated.title}" have been modified.`,
            related_entity_type: 'hangout',
            related_entity_id: updated.id,
          },
        }).catch(() => null);
      }
    } catch {
      // Non-blocking notification
    }

    return {
      id: updated.id,
      communityId: updated.community_id,
      community: updated.community,
      title: updated.title,
      description: updated.description,
      coverImageUrl: updated.cover_image_url,
      startsAt: updated.starts_at,
      endsAt: updated.ends_at,
      visibility: updated.visibility,
      joinType: updated.join_type,
      maxParticipants: updated.max_participants,
      creator: updated.creator,
      location: updated.location,
    };
  }

  /**
   * Soft delete hangout (Creator OR Community Admin/Mod/Owner if community-tied)
   */
  async softDelete(id: string, userId: string): Promise<{ success: true }> {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    const userCommunityRoles = await this.caslAbilityFactory.getUserCommunityRoles(userId);
    const ability = this.caslAbilityFactory.createForUser({ id: userId }, userCommunityRoles);

    const hangoutSubject = subject('Hangout', {
      creator_id: hangout.creator_id,
      community_id: hangout.community_id,
    } as any);

    if (!ability.can('delete', hangoutSubject)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission to delete this hangout',
      });
    }

    await this.prisma.hangouts.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Join open hangout
   */
  async join(id: string, userId: string) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
      include: { community: true },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    if (hangout.join_type !== 'open' && hangout.creator_id !== userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This hangout requires an approval request to join',
      });
    }

    if (hangout.community && hangout.community.is_private) {
      const roles = await this.getCommunityRole(
        hangout.community.id,
        hangout.community.creator_id,
        userId,
      );
      if (!roles.isMember) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Membership required to join hangouts in this community',
        });
      }
    }

    // Ban check
    const ban = await this.prisma.hangout_bans.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
    });

    if (ban) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are banned from participating in this hangout',
      });
    }

    const existing = await this.prisma.hangout_participants.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      const count = await this.prisma.hangout_participants.count({ where: { hangout_id: id } });
      return { joined: true, participantsCount: count };
    }

    // Capacity check
    if (hangout.max_participants !== null) {
      const count = await this.prisma.hangout_participants.count({ where: { hangout_id: id } });
      if (count >= hangout.max_participants) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Hangout is full',
        });
      }
    }

    await this.prisma.hangout_participants.create({
      data: {
        hangout_id: id,
        user_id: userId,
      },
    });

    // Only notify creator on open hangouts (for request-based, creator already knows and approved)
    const isRequestBased =
      hangout.join_type === 'request_based' ||
      (hangout.join_type as string) === 'REQUEST_BASED' ||
      (hangout.join_type as string) === 'request' ||
      (hangout.join_type as string) === 'REQUEST';

    if (hangout.creator_id !== userId && !isRequestBased) {
      const joiner = await this.prisma.users.findUnique({
        where: { id: userId },
        select: { name: true, first_name: true, last_name: true, username: true },
      });
      const joinerName = joiner?.first_name ? `${joiner.first_name} ${joiner.last_name || ''}`.trim() : joiner?.name || (joiner?.username ? `@${joiner.username}` : 'Someone');
      await this.prisma.notifications.create({
        data: {
          user_id: hangout.creator_id,
          type: 'hangout_approved',
          title: 'New Hangout Participant',
          message: `${joinerName} joined your hangout "${hangout.title}"`,
          related_entity_type: 'hangout',
          related_entity_id: hangout.id,
        },
      }).catch(() => null);
    }

    const participantsCount = await this.prisma.hangout_participants.count({
      where: { hangout_id: id },
    });
    return { joined: true, participantsCount };
  }

  /**
   * Leave hangout
   */
  async leave(id: string, userId: string) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    const existing = await this.prisma.hangout_participants.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      await this.prisma.hangout_participants.delete({
        where: {
          hangout_id_user_id: {
            hangout_id: id,
            user_id: userId,
          },
        },
      });

      // Notify hangout creator that participant left
      if (hangout.creator_id !== userId) {
        const leaver = await this.prisma.users.findUnique({
          where: { id: userId },
          select: { name: true, first_name: true, last_name: true, username: true },
        });
        const leaverName = leaver?.first_name ? `${leaver.first_name} ${leaver.last_name || ''}`.trim() : leaver?.name || (leaver?.username ? `@${leaver.username}` : 'Someone');
        await this.prisma.notifications.create({
          data: {
            user_id: hangout.creator_id,
            type: 'hangout_approved',
            title: 'Hangout Participant Left',
            message: `${leaverName} left your hangout "${hangout.title}"`,
            related_entity_type: 'hangout',
            related_entity_id: hangout.id,
          },
        }).catch(() => null);
      }
    }

    // Cancel any pending join request so user can toggle between pending and unjoined
    await this.prisma.hangout_join_requests.deleteMany({
      where: {
        hangout_id: id,
        user_id: userId,
      },
    });

    const participantsCount = await this.prisma.hangout_participants.count({
      where: { hangout_id: id },
    });
    return { joined: false, participantsCount };
  }

  /**
   * Request to join (for request_based hangouts)
   */
  async requestJoin(id: string, userId: string) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    // If the user is the creator of the hangout, they join directly without requesting approval
    if (hangout.creator_id === userId) {
      await this.join(id, userId);
      return {
        requested: true,
        status: 'approved',
      };
    }

    if (hangout.join_type !== 'request_based') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This hangout is open; you can join directly without requesting',
      });
    }

    // Ban check
    const ban = await this.prisma.hangout_bans.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
    });

    if (ban) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are banned from requesting to join this hangout',
      });
    }

    // Check if already participant
    const isParticipant = await this.prisma.hangout_participants.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
    });

    if (isParticipant) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'You are already a participant of this hangout',
      });
    }

    await this.prisma.hangout_join_requests.upsert({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: userId,
        },
      },
      create: {
        hangout_id: id,
        user_id: userId,
        status: 'pending',
      },
      update: {
        status: 'pending',
        responded_at: null,
      },
    });

    // Notify hangout creator with requester's display name
    const requester = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true, name: true, username: true },
    });
    const requesterName =
      requester?.first_name && requester?.last_name
        ? `${requester.first_name} ${requester.last_name}`
        : requester?.name || requester?.first_name || (requester?.username ? `@${requester.username}` : 'A user');

    await this.prisma.notifications.create({
      data: {
        user_id: hangout.creator_id,
        type: 'hangout_request',
        title: 'Hangout Join Request',
        message: `${requesterName} has requested to join your hangout "${hangout.title}".`,
        related_entity_type: 'hangout',
        related_entity_id: hangout.id,
      },
    });

    return {
      requested: true,
      status: 'pending',
    };
  }

  /**
   * Approve or reject join request (Creator only)
   */
  async respondRequest(
    id: string,
    targetUserId: string,
    userId: string,
    dto: RespondHangoutRequestDto,
  ) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    if (hangout.creator_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the creator can respond to join requests',
      });
    }

    const request = await this.prisma.hangout_join_requests.findUnique({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: targetUserId,
        },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Join request not found',
      });
    }

    await this.prisma.hangout_join_requests.update({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: targetUserId,
        },
      },
      data: {
        status: dto.status,
        responded_at: new Date(),
      },
    });

    if (dto.status === 'approved') {
      // Capacity check
      if (hangout.max_participants !== null) {
        const count = await this.prisma.hangout_participants.count({ where: { hangout_id: id } });
        if (count >= hangout.max_participants) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Hangout is full',
          });
        }
      }

      await this.prisma.hangout_participants.upsert({
        where: {
          hangout_id_user_id: {
            hangout_id: id,
            user_id: targetUserId,
          },
        },
        create: {
          hangout_id: id,
          user_id: targetUserId,
        },
        update: {},
      });

      // Notify approved user
      await this.prisma.notifications.create({
        data: {
          user_id: targetUserId,
          type: 'hangout_approved',
          title: 'Hangout Request Approved',
          message: `Your request to join "${hangout.title}" has been approved.`,
          related_entity_type: 'hangout',
          related_entity_id: hangout.id,
        },
      });
    }

    return {
      status: dto.status,
      userId: targetUserId,
    };
  }

  /**
   * Ban user from hangout (Creator OR Community Admin/Mod/Owner; creator & owner protected)
   */
  async banUser(id: string, userId: string, dto: BanHangoutUserDto) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
      include: { community: true },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    const isCreator = hangout.creator_id === userId;
    let isCommunityLeadership = false;

    if (!isCreator && hangout.community) {
      const roles = await this.getCommunityRole(
        hangout.community.id,
        hangout.community.creator_id,
        userId,
      );
      isCommunityLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    }

    if (!isCreator && !isCommunityLeadership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the creator or community moderators can ban users from this hangout',
      });
    }

    // Protection checks
    if (hangout.creator_id === dto.userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot ban the hangout creator',
      });
    }

    if (hangout.community && hangout.community.creator_id === dto.userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot ban the community owner from a hangout',
      });
    }

    await this.prisma.hangout_bans.upsert({
      where: {
        hangout_id_user_id: {
          hangout_id: id,
          user_id: dto.userId,
        },
      },
      create: {
        hangout_id: id,
        user_id: dto.userId,
        banned_by: userId,
        reason: dto.reason ?? null,
      },
      update: {
        banned_by: userId,
        reason: dto.reason ?? null,
      },
    });

    // Evict from participants
    await this.prisma.hangout_participants.deleteMany({
      where: {
        hangout_id: id,
        user_id: dto.userId,
      },
    });

    // Remove any pending join requests
    await this.prisma.hangout_join_requests.deleteMany({
      where: {
        hangout_id: id,
        user_id: dto.userId,
      },
    });

    return {
      banned: true,
      userId: dto.userId,
    };
  }

  /**
   * Toggle save (bookmark) on hangout
   */
  async toggleSave(id: string, userId: string) {
    const hangout = await this.prisma.hangouts.findFirst({
      where: { id, deleted_at: null },
    });

    if (!hangout) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Hangout not found',
      });
    }

    const existing = await this.prisma.saved_hangouts.findUnique({
      where: {
        user_id_hangout_id: {
          user_id: userId,
          hangout_id: id,
        },
      },
    });

    if (existing) {
      await this.prisma.saved_hangouts.delete({
        where: {
          user_id_hangout_id: {
            user_id: userId,
            hangout_id: id,
          },
        },
      });
      return { saved: false };
    } else {
      await this.prisma.saved_hangouts.create({
        data: {
          user_id: userId,
          hangout_id: id,
        },
      });
      return { saved: true };
    }
  }
}
