import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { subject } from '@casl/ability';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { LocationsService } from '@/modules/locations/locations.service';
import { ErrorCode } from '@/core/common/enums';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';
import {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
  BanEventUserDto,
  RejectEventDto,
} from './dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Helper to check caller's role in a community
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
   * Helper to resolve or create a location from locationId, locationName, or coordinates
   */
  private async resolveLocationId(
    locationId?: string | null,
    locationName?: string | null,
    latitude?: number | null,
    longitude?: number | null,
  ): Promise<string | null> {
    return this.locationsService.resolveLocation({
      locationId,
      locationName,
      latitude,
      longitude,
    });
  }

  /**
   * Create event in a community (Member+ only)
   */
  async create(slug: string, userId: string, dto: CreateEventDto) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
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
        message: 'Only community members can create events',
      });
    }

    // Role-based approval status
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    const approvalStatus = isLeadership ? 'approved' : 'proposed';
    const isVerified = isLeadership;

    const resolvedLocationId = await this.resolveLocationId(
      dto.locationId,
      dto.location || dto.locationName,
      dto.latitude,
      dto.longitude,
    );

    const event = await this.prisma.events.create({
      data: {
        creator_id: userId,
        community_id: community.id,
        subcommunity_id: dto.subcommunityId ?? null,
        location_id: resolvedLocationId,
        title: dto.title,
        description: dto.description ?? null,
        cover_image_url: dto.coverImageUrl && dto.coverImageUrl.trim() ? await resolveDirectImageUrl(dto.coverImageUrl.trim()) : null,
        starts_at: new Date(dto.startsAt),
        ends_at: dto.endsAt ? new Date(dto.endsAt) : null,
        visibility: dto.visibility ?? 'public',
        approval_status: approvalStatus,
        is_verified: isVerified,
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
        location: true,
      },
    });

    // Automatically add creator as participant
    await this.prisma.event_participants.create({
      data: {
        event_id: event.id,
        user_id: userId,
      },
    });

    // Notify community members when a new approved event is published
    if (event.approval_status === 'approved') {
      try {
        const members = await this.prisma.community_members.findMany({
          where: {
            community_id: community.id,
            user_id: { not: userId },
          },
          select: { user_id: true },
        });

        if (members.length > 0) {
          await this.prisma.notifications.createMany({
            data: members.map((m) => ({
              user_id: m.user_id,
              type: 'event_approved' as const,
              title: 'New Community Event',
              message: `${community.name} published a new event: "${event.title}"`,
              related_entity_type: 'event',
              related_entity_id: event.id,
            })),
          });
        }
      } catch {}
    } else if (event.approval_status === 'proposed') {
      // Notify community owner and administrators about the new event proposal
      try {
        const leadershipMembers = await this.prisma.community_members.findMany({
          where: {
            community_id: community.id,
            role: { in: ['admin', 'moderator'] },
            user_id: { not: userId },
          },
          select: { user_id: true },
        });

        const targetUserIds = new Set<string>();
        if (community.creator_id && community.creator_id !== userId) {
          targetUserIds.add(community.creator_id);
        }
        leadershipMembers.forEach((m) => targetUserIds.add(m.user_id));

        const proposer = await this.prisma.users.findUnique({
          where: { id: userId },
          select: { first_name: true, last_name: true, name: true, username: true },
        });
        const proposerName = proposer?.first_name
          ? `${proposer.first_name} ${proposer.last_name || ''}`.trim()
          : proposer?.name || (proposer?.username ? `@${proposer.username}` : 'A member');

        if (targetUserIds.size > 0) {
          await this.prisma.notifications.createMany({
            data: Array.from(targetUserIds).map((targetId) => ({
              user_id: targetId,
              type: 'moderation_action' as const,
              title: 'New Event Proposal',
              message: `${proposerName} proposed a new event "${event.title}" in ${community.name}. Review and approve or reject it.`,
              related_entity_type: 'event',
              related_entity_id: event.id,
            })),
          });
        }
      } catch {}
    }

    return {
      id: event.id,
      communityId: event.community_id,
      title: event.title,
      description: event.description,
      coverImageUrl: event.cover_image_url,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      visibility: event.visibility,
      approvalStatus: event.approval_status,
      isVerified: event.is_verified,
      maxParticipants: event.max_participants,
      creator: event.creator,
      location: event.location,
      participantsCount: 1,
      isParticipant: true,
      isSaved: false,
    };
  }

  /**
   * List community events (respects visibility, approval status, and bans)
   */
  async findAll(slug: string, query: EventQueryDto, userId?: string) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    const roles = await this.getCommunityRole(community.id, community.creator_id, userId);

    if (community.is_private && !roles.isMember) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This community is private. Authentication required.',
      });
    }

    // Exclude events where user is banned
    let bannedEventIds: string[] = [];
    if (userId) {
      const bans = await this.prisma.event_bans.findMany({
        where: { user_id: userId },
        select: { event_id: true },
      });
      bannedEventIds = bans.map((b) => b.event_id);
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      community_id: community.id,
      deleted_at: null,
    };

    if (bannedEventIds.length > 0) {
      where.id = { notIn: bannedEventIds };
    }

    // Approval status filtering
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    if (isLeadership) {
      if (query.status) {
        where.approval_status = query.status;
      }
    } else {
      // Regular members & public see approved, or their own proposed events
      where.OR = [
        { approval_status: 'approved' },
        ...(userId ? [{ creator_id: userId, approval_status: 'proposed' }] : []),
      ];
    }

    // Visibility filtering
    if (!roles.isMember) {
      where.visibility = 'public';
    } else if (query.visibility) {
      where.visibility = query.visibility;
    }

    const [total, items] = await Promise.all([
      this.prisma.events.count({ where }),
      this.prisma.events.findMany({
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
      }),
    ]);

    const formatted = items.map((e: any) => ({
      id: e.id,
      creatorId: e.creator_id,
      creator_id: e.creator_id,
      communityId: e.community_id,
      title: e.title,
      description: e.description,
      coverImageUrl: e.cover_image_url,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      visibility: e.visibility,
      approvalStatus: e.approval_status,
      isVerified: e.is_verified,
      maxParticipants: e.max_participants,
      creator: e.creator,
      location: e.location,
      participantsCount: e._count.participants,
      isParticipant: userId ? e.participants?.length > 0 : false,
      isSaved: userId ? e.saved_by?.length > 0 : false,
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
   * Get single event by ID (respects visibility, approval status, and bans)
   */
  async findOne(slug: string, id: string, userId?: string) {
    const event: any = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
            creator_id: true,
            is_private: true,
            profile_picture_url: true,
            banner_url: true,
          },
        },
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

    if (!event || event.creator.deleted_at !== null) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);

    if (event.community.is_private && !roles.isMember) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This community is private. Authentication required.',
      });
    }

    if (event.visibility === 'community' && !roles.isMember) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This event is restricted to community members.',
      });
    }

    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    const isCreator = event.creator_id === userId;

    if (event.approval_status !== 'approved' && !isLeadership && !isCreator) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    // Check if user is banned from this event
    let isBanned = false;
    if (userId) {
      const ban = await this.prisma.event_bans.findUnique({
        where: {
          event_id_user_id: {
            event_id: id,
            user_id: userId,
          },
        },
      });
      isBanned = !!ban;
    }

    // Fetch attendee preview (first 20)
    const attendees = await this.prisma.event_participants.findMany({
      where: { event_id: id },
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

    return {
      id: event.id,
      creatorId: event.creator_id,
      creator_id: event.creator_id,
      community: {
        id: event.community.id,
        name: event.community.name,
        slug: event.community.slug,
        profile_picture_url: event.community.profile_picture_url,
        banner_url: event.community.banner_url,
      },
      title: event.title,
      description: event.description,
      coverImageUrl: event.cover_image_url,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      visibility: event.visibility,
      approvalStatus: event.approval_status,
      isVerified: event.is_verified,
      maxParticipants: event.max_participants,
      creator: event.creator,
      location: event.location,
      participantsCount: event._count.participants,
      participants: attendees.map((a) => a.user),
      isParticipant: userId ? event.participants?.length > 0 : false,
      isBanned,
      isSaved: userId ? event.saved_by?.length > 0 : false,
    };
  }

  /**
   * Find event directly by ID without knowing slug in advance
   */
  async findById(id: string, userId?: string) {
    const event = await this.prisma.events.findFirst({
      where: { id, deleted_at: null },
      include: {
        community: {
          select: { slug: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    return this.findOne(event.community.slug, id, userId);
  }

  /**
   * Update event (Author OR Admin/Mod/Owner; approval status immutable via PATCH)
   */
  async update(slug: string, id: string, userId: string, dto: UpdateEventDto) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    const isCreator = event.creator_id === userId;

    if (!isLeadership && !isCreator) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the author or community moderators can update this event',
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
    if (
      dto.location !== undefined ||
      dto.locationName !== undefined ||
      dto.locationId !== undefined ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined
    ) {
      updateData.location_id = await this.resolveLocationId(
        dto.locationId,
        dto.location || dto.locationName,
        dto.latitude,
        dto.longitude,
      );
    }
    if (dto.subcommunityId !== undefined) updateData.subcommunity_id = dto.subcommunityId;
    if (dto.maxParticipants !== undefined) {
      updateData.max_participants = dto.maxParticipants ? Number(dto.maxParticipants) : null;
    }

    const updated = await this.prisma.events.update({
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
        location: true,
      },
    });

    // Notify participants and creator about modifications
    try {
      const participants = await this.prisma.event_participants.findMany({
        where: { event_id: id },
        select: { user_id: true },
      });
      const recipientIds = new Set<string>(participants.map((p) => p.user_id));
      if (event.creator_id !== userId) {
        recipientIds.add(event.creator_id);
      }
      recipientIds.delete(userId);

      for (const targetUserId of recipientIds) {
        await this.prisma.notifications.create({
          data: {
            user_id: targetUserId,
            type: 'event_reminder',
            title: 'Event Updated',
            message: `Details about "${updated.title}" have been modified.`,
            related_entity_type: 'event',
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
      title: updated.title,
      description: updated.description,
      coverImageUrl: updated.cover_image_url,
      startsAt: updated.starts_at,
      endsAt: updated.ends_at,
      visibility: updated.visibility,
      approvalStatus: updated.approval_status,
      isVerified: updated.is_verified,
      maxParticipants: updated.max_participants,
      creator: updated.creator,
      location: updated.location,
    };
  }

  /**
   * Soft delete event (Author OR Admin/Mod/Owner via CASL)
   */
  async softDelete(slug: string, id: string, userId: string): Promise<{ success: true }> {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const userCommunityRoles = await this.caslAbilityFactory.getUserCommunityRoles(userId);
    const ability = this.caslAbilityFactory.createForUser({ id: userId }, userCommunityRoles);

    const eventSubject = subject('Event', {
      creator_id: event.creator_id,
      community_id: event.community_id,
    } as any);

    if (!ability.can('delete', eventSubject)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission to delete this event',
      });
    }

    await this.prisma.events.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return { success: true };
  }

  /**
   * Join an event (checks bans and maxParticipants)
   */
  async join(slug: string, id: string, userId: string) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: {
        community: true,
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    if (event.approval_status !== 'approved') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot join an event that has not been approved',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);
    if (event.community.is_private && !roles.isMember) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Membership required to join events in this community',
      });
    }

    // Ban check
    const ban = await this.prisma.event_bans.findUnique({
      where: {
        event_id_user_id: {
          event_id: id,
          user_id: userId,
        },
      },
    });

    if (ban) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are banned from participating in this event',
      });
    }

    const existing = await this.prisma.event_participants.findUnique({
      where: {
        event_id_user_id: {
          event_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      const count = await this.prisma.event_participants.count({ where: { event_id: id } });
      return { joined: true, participantsCount: count };
    }

    // Capacity check
    if (event.max_participants !== null) {
      const currentCount = await this.prisma.event_participants.count({ where: { event_id: id } });
      if (currentCount >= event.max_participants) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Event is full',
        });
      }
    }

    await this.prisma.event_participants.create({
      data: {
        event_id: id,
        user_id: userId,
      },
    });

    const participantsCount = await this.prisma.event_participants.count({ where: { event_id: id } });
    return { joined: true, participantsCount };
  }

  /**
   * Leave an event
   */
  async leave(slug: string, id: string, userId: string) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const existing = await this.prisma.event_participants.findUnique({
      where: {
        event_id_user_id: {
          event_id: id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      await this.prisma.event_participants.delete({
        where: {
          event_id_user_id: {
            event_id: id,
            user_id: userId,
          },
        },
      });
    }

    const participantsCount = await this.prisma.event_participants.count({ where: { event_id: id } });
    return { joined: false, participantsCount };
  }

  /**
   * Approve proposed event (Admin/Mod/Owner only; sets verified and emits notification)
   */
  async approve(slug: string, id: string, userId: string) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    if (!isLeadership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community moderators can approve proposed events',
      });
    }

    const updated = await this.prisma.events.update({
      where: { id },
      data: {
        approval_status: 'approved',
        is_verified: true,
      },
    });

    // Emits event_approved notification to event creator
    await this.prisma.notifications.create({
      data: {
        user_id: event.creator_id,
        type: 'event_approved',
        title: 'Event Approved',
        message: `Your proposed event "${event.title}" has been approved.`,
        related_entity_type: 'event',
        related_entity_id: event.id,
      },
    });

    // Notify all other community members about the newly approved event
    try {
      const members = await this.prisma.community_members.findMany({
        where: {
          community_id: event.community_id,
          user_id: { not: event.creator_id },
        },
        select: { user_id: true },
      });

      if (members.length > 0) {
        await this.prisma.notifications.createMany({
          data: members.map((m) => ({
            user_id: m.user_id,
            type: 'event_approved' as const,
            title: 'New Community Event',
            message: `${event.community.name} published a new event: "${event.title}"`,
            related_entity_type: 'event',
            related_entity_id: event.id,
          })),
        });
      }
    } catch {}

    return {
      id: updated.id,
      approvalStatus: updated.approval_status,
      isVerified: updated.is_verified,
    };
  }

  /**
   * Reject proposed event (Admin/Mod/Owner only; emits notification)
   */
  async reject(slug: string, id: string, userId: string, dto?: RejectEventDto) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    if (!isLeadership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community moderators can reject proposed events',
      });
    }

    const updated = await this.prisma.events.update({
      where: { id },
      data: {
        approval_status: 'rejected',
      },
    });

    // Emits moderation_action notification to event creator
    await this.prisma.notifications.create({
      data: {
        user_id: event.creator_id,
        type: 'moderation_action',
        title: 'Event Proposal Rejected',
        message: dto?.reason
          ? `Your proposed event "${event.title}" was rejected. Reason: ${dto.reason}`
          : `Your proposed event "${event.title}" was rejected by community moderators.`,
        related_entity_type: 'event',
        related_entity_id: event.id,
      },
    });

    return {
      id: updated.id,
      approvalStatus: updated.approval_status,
      isVerified: updated.is_verified,
    };
  }

  /**
   * Ban user from event (Admin/Mod/Owner; owner protection; evicts participant)
   */
  async banUser(slug: string, id: string, userId: string, dto: BanEventUserDto) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
      include: { community: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const roles = await this.getCommunityRole(event.community.id, event.community.creator_id, userId);
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    if (!isLeadership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community moderators can ban users from events',
      });
    }

    // Owner protection invariant: cannot ban community owner
    if (event.community.creator_id === dto.userId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot ban the community owner from an event',
      });
    }

    // Create or update ban in event_bans
    await this.prisma.event_bans.upsert({
      where: {
        event_id_user_id: {
          event_id: id,
          user_id: dto.userId,
        },
      },
      create: {
        event_id: id,
        user_id: dto.userId,
        banned_by: userId,
        reason: dto.reason ?? null,
      },
      update: {
        banned_by: userId,
        reason: dto.reason ?? null,
      },
    });

    // Evict user from event_participants if present
    await this.prisma.event_participants.deleteMany({
      where: {
        event_id: id,
        user_id: dto.userId,
      },
    });

    return {
      banned: true,
      userId: dto.userId,
    };
  }

  /**
   * Toggle save (bookmark) event
   */
  async toggleSave(slug: string, id: string, userId: string) {
    const event = await this.prisma.events.findFirst({
      where: {
        id,
        community: { slug, deleted_at: null },
        deleted_at: null,
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found',
      });
    }

    const existing = await this.prisma.saved_events.findUnique({
      where: {
        user_id_event_id: {
          user_id: userId,
          event_id: id,
        },
      },
    });

    if (existing) {
      await this.prisma.saved_events.delete({
        where: {
          user_id_event_id: {
            user_id: userId,
            event_id: id,
          },
        },
      });
      return { saved: false };
    } else {
      await this.prisma.saved_events.create({
        data: {
          user_id: userId,
          event_id: id,
        },
      });
      return { saved: true };
    }
  }

  /**
   * List proposed events awaiting moderation review in community
   */
  async listPendingEvents(slug: string, userId: string, query: EventQueryDto) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    const roles = await this.getCommunityRole(community.id, community.creator_id, userId);
    const isLeadership = roles.isOwner || roles.isAdmin || roles.isMod;
    if (!isLeadership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community moderators can view pending events',
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
      community_id: community.id,
      approval_status: 'proposed' as const,
      deleted_at: null,
    };

    const [total, items] = await Promise.all([
      this.prisma.events.count({ where }),
      this.prisma.events.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'asc' },
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
          location: true,
          _count: {
            select: {
              participants: true,
            },
          },
        },
      }),
    ]);

    const formatted = items.map((e: any) => ({
      id: e.id,
      communityId: e.community_id,
      title: e.title,
      description: e.description,
      coverImageUrl: e.cover_image_url,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      visibility: e.visibility,
      approvalStatus: e.approval_status,
      isVerified: e.is_verified,
      maxParticipants: e.max_participants,
      creator: e.creator,
      location: e.location,
      participantsCount: e._count.participants,
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
}
