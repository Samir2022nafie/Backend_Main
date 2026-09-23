import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { CaslAbilityFactory } from '@/core/security/casl-ability.factory';
import { ErrorCode } from '@/core/common/enums';
import {
  CreateReportDto,
  UpdateReportStatusDto,
  TakeModerationActionDto,
  ReportQueryDto,
} from './dto';
import { PaginationDto } from '@/core/utils/zod-utils';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Helper to verify if caller is community leadership (owner, admin, mod)
   */
  private async getCommunityRole(communityId: string, creatorId: string, userId?: string) {
    if (!userId) {
      return { isOwner: false, isAdmin: false, isMod: false, isLeader: false };
    }

    if (creatorId === userId) {
      return { isOwner: true, isAdmin: true, isMod: true, isLeader: true };
    }

    const member = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: communityId,
          user_id: userId,
        },
      },
    });

    const isAdmin = member?.role === 'admin';
    const isMod = member?.role === 'moderator';

    return {
      isOwner: false,
      isAdmin,
      isMod,
      isLeader: isAdmin || isMod,
    };
  }

  /**
   * Helper to get list of community IDs where caller has moderation privileges
   */
  private async getManagedCommunityIds(userId: string): Promise<string[]> {
    const [ownedCommunities, memberLeadership] = await Promise.all([
      this.prisma.communities.findMany({
        where: { creator_id: userId, deleted_at: null },
        select: { id: true },
      }),
      this.prisma.community_members.findMany({
        where: {
          user_id: userId,
          role: { in: ['admin', 'moderator'] },
          community: { deleted_at: null },
        },
        select: { community_id: true },
      }),
    ]);

    const ids = new Set<string>();
    ownedCommunities.forEach((c) => ids.add(c.id));
    memberLeadership.forEach((m) => ids.add(m.community_id));
    return Array.from(ids);
  }

  /**
   * 1. Create a report
   */
  async createReport(userId: string, dto: CreateReportDto) {
    // Validate that target entity exists
    if (dto.reportedUserId) {
      const user = await this.prisma.users.findFirst({
        where: { id: dto.reportedUserId, deleted_at: null },
      });
      if (!user) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Reported user does not exist',
        });
      }
    } else if (dto.reportedPostId) {
      const post = await this.prisma.posts.findFirst({
        where: { id: dto.reportedPostId, deleted_at: null },
      });
      if (!post) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Reported post does not exist',
        });
      }
    } else if (dto.reportedCommentId) {
      const comment = await this.prisma.comments.findFirst({
        where: { id: dto.reportedCommentId, deleted_at: null },
      });
      if (!comment) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Reported comment does not exist',
        });
      }
    } else if (dto.reportedEventId) {
      const event = await this.prisma.events.findFirst({
        where: { id: dto.reportedEventId, deleted_at: null },
      });
      if (!event) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Reported event does not exist',
        });
      }
    } else if (dto.reportedHangoutId) {
      const hangout = await this.prisma.hangouts.findFirst({
        where: { id: dto.reportedHangoutId, deleted_at: null },
      });
      if (!hangout) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Reported hangout does not exist',
        });
      }
    }

    const report = await this.prisma.reports.create({
      data: {
        reporter_id: userId,
        reported_user_id: dto.reportedUserId ?? null,
        reported_post_id: dto.reportedPostId ?? null,
        reported_comment_id: dto.reportedCommentId ?? null,
        reported_event_id: dto.reportedEventId ?? null,
        reported_hangout_id: dto.reportedHangoutId ?? null,
        reason: dto.reason,
        status: 'pending',
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            name: true,
            profile_picture_url: true,
          },
        },
      },
    });

    return report;
  }

  /**
   * 2. List reports (Admin/Mod/Owner, filtered to communities they manage)
   */
  async listReports(userId: string, query: ReportQueryDto) {
    const managedIds = await this.getManagedCommunityIds(userId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    if (managedIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const where: any = {
      OR: [
        { post: { community_id: { in: managedIds } } },
        { comment: { post: { community_id: { in: managedIds } } } },
        { event: { community_id: { in: managedIds } } },
        { hangout: { community_id: { in: managedIds } } },
        { reportedUser: { community_memberships: { some: { community_id: { in: managedIds } } } } },
      ],
    };

    if (query.status) {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      this.prisma.reports.count({ where }),
      this.prisma.reports.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          reporter: {
            select: { id: true, username: true, name: true, profile_picture_url: true },
          },
          reportedUser: {
            select: { id: true, username: true, name: true, profile_picture_url: true },
          },
          post: { select: { id: true, title: true, community_id: true } },
          comment: { select: { id: true, content: true, post_id: true } },
          event: { select: { id: true, title: true, community_id: true } },
          hangout: { select: { id: true, title: true, community_id: true } },
          reviewer: { select: { id: true, username: true, name: true } },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 3. Update report status (reviewing, resolved, dismissed)
   */
  async updateReportStatus(id: string, userId: string, dto: UpdateReportStatusDto) {
    const report = await this.prisma.reports.findUnique({
      where: { id },
      include: {
        post: { select: { community_id: true } },
        comment: { select: { post: { select: { community_id: true } } } },
        event: { select: { community_id: true } },
        hangout: { select: { community_id: true } },
      },
    });

    if (!report) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Report not found',
      });
    }

    const communityId =
      (report as any).post?.community_id ||
      (report as any).comment?.post?.community_id ||
      (report as any).event?.community_id ||
      (report as any).hangout?.community_id;

    if (communityId) {
      const community = await this.prisma.communities.findUnique({ where: { id: communityId } });
      if (community) {
        const roles = await this.getCommunityRole(community.id, community.creator_id, userId);
        if (!roles.isLeader) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'You do not have moderator permissions for this content',
          });
        }
      }
    } else {
      const managedIds = await this.getManagedCommunityIds(userId);
      if (managedIds.length === 0) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'You must be a community moderator to update reports',
        });
      }
    }

    const updateData: any = {
      status: dto.status,
    };

    if (dto.status === 'resolved' || dto.status === 'dismissed') {
      updateData.reviewed_by = userId;
      updateData.reviewed_at = new Date();
    }

    const updated = await this.prisma.reports.update({
      where: { id },
      data: updateData,
      include: {
        reporter: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
      },
    });

    // Notify reporter if resolved or dismissed
    if (dto.status === 'resolved' || dto.status === 'dismissed') {
      await this.prisma.notifications.create({
        data: {
          user_id: report.reporter_id,
          type: 'moderation_action',
          title: 'Report Update',
          message: `Your report has been marked as ${dto.status}.`,
          related_entity_type: 'report',
          related_entity_id: id,
        },
      });
    }

    return updated;
  }

  /**
   * 4. Take moderation action on report
   */
  async takeAction(id: string, userId: string, dto: TakeModerationActionDto) {
    const report: any = await this.prisma.reports.findUnique({
      where: { id },
      include: {
        post: { select: { id: true, author_id: true, community_id: true } },
        comment: {
          select: { id: true, author_id: true, post: { select: { community_id: true } } },
        },
        event: { select: { id: true, creator_id: true, community_id: true } },
        hangout: { select: { id: true, creator_id: true, community_id: true } },
      },
    });

    if (!report) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Report not found',
      });
    }

    const communityId =
      report.post?.community_id ||
      report.comment?.post?.community_id ||
      report.event?.community_id ||
      report.hangout?.community_id;

    let community: any = null;
    if (communityId) {
      community = await this.prisma.communities.findUnique({ where: { id: communityId } });
      if (community) {
        const roles = await this.getCommunityRole(community.id, community.creator_id, userId);
        if (!roles.isLeader) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: 'You do not have permission to moderate content in this community',
          });
        }
      }
    }

    // Determine target user
    const targetUserId =
      dto.targetUserId ||
      report.reported_user_id ||
      report.post?.author_id ||
      report.comment?.author_id ||
      report.event?.creator_id ||
      report.hangout?.creator_id;

    // Check Owner Protection: cannot ban the community creator
    if (community && dto.actionType === 'ban' && targetUserId) {
      if (community.creator_id === targetUserId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Cannot ban the community owner',
        });
      }
    }

    // Execute side-effects based on actionType
    if (dto.actionType === 'content_removed') {
      if (report.reported_post_id) {
        await this.prisma.posts.update({
          where: { id: report.reported_post_id },
          data: { deleted_at: new Date() },
        });
      } else if (report.reported_comment_id) {
        await this.prisma.comments.update({
          where: { id: report.reported_comment_id },
          data: { deleted_at: new Date() },
        });
      } else if (report.reported_event_id) {
        await this.prisma.events.update({
          where: { id: report.reported_event_id },
          data: { deleted_at: new Date() },
        });
      } else if (report.reported_hangout_id) {
        await this.prisma.hangouts.update({
          where: { id: report.reported_hangout_id },
          data: { deleted_at: new Date() },
        });
      }
    } else if (dto.actionType === 'ban' && communityId && targetUserId) {
      await this.prisma.community_members.deleteMany({
        where: {
          community_id: communityId,
          user_id: targetUserId,
        },
      });
    }

    // Create moderation_actions row
    const modAction = await this.prisma.moderation_actions.create({
      data: {
        moderator_id: userId,
        target_user_id: targetUserId ?? null,
        report_id: id,
        action_type: dto.actionType,
        notes: dto.notes ?? null,
      },
      include: {
        moderator: { select: { id: true, username: true, name: true } },
        targetUser: { select: { id: true, username: true, name: true } },
      },
    });

    // Create audit_logs row
    await this.prisma.audit_logs.create({
      data: {
        actor_id: userId,
        action: dto.actionType,
        entity_type: 'report',
        entity_id: id,
        description: dto.notes ?? `Moderation action taken: ${dto.actionType}`,
      },
    });

    // Automatically resolve the report
    const updatedReport = await this.prisma.reports.update({
      where: { id },
      data: {
        status: 'resolved',
        reviewed_by: userId,
        reviewed_at: new Date(),
      },
    });

    // Notify target user if identified
    if (targetUserId) {
      await this.prisma.notifications.create({
        data: {
          user_id: targetUserId,
          type: 'moderation_action',
          title: 'Moderation Action Taken',
          message: `A moderation action (${dto.actionType}) was taken regarding your content.`,
          related_entity_type: 'report',
          related_entity_id: id,
        },
      });
    }

    return {
      moderationAction: modAction,
      report: updatedReport,
    };
  }

  /**
   * 5. List community reports
   */
  async listCommunityReports(slug: string, userId: string, query: ReportQueryDto) {
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
    if (!roles.isLeader) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Community moderator privileges required',
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { post: { community_id: community.id } },
        { comment: { post: { community_id: community.id } } },
        { event: { community_id: community.id } },
        { hangout: { community_id: community.id } },
      ],
    };

    if (query.status) {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      this.prisma.reports.count({ where }),
      this.prisma.reports.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          reporter: { select: { id: true, username: true, name: true, profile_picture_url: true } },
          reportedUser: {
            select: { id: true, username: true, name: true, profile_picture_url: true },
          },
          post: { select: { id: true, title: true } },
          comment: { select: { id: true, content: true } },
          event: { select: { id: true, title: true } },
          hangout: { select: { id: true, title: true } },
          reviewer: { select: { id: true, username: true, name: true } },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 6. List community moderation actions
   */
  async listCommunityModerationActions(slug: string, userId: string, query: PaginationDto) {
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
    if (!roles.isLeader) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Community moderator privileges required',
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      report: {
        OR: [
          { post: { community_id: community.id } },
          { comment: { post: { community_id: community.id } } },
          { event: { community_id: community.id } },
          { hangout: { community_id: community.id } },
        ],
      },
    };

    const [total, items] = await Promise.all([
      this.prisma.moderation_actions.count({ where }),
      this.prisma.moderation_actions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          moderator: { select: { id: true, username: true, name: true } },
          targetUser: { select: { id: true, username: true, name: true } },
          report: { select: { id: true, reason: true, status: true } },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 7. List community banned users (from events and hangouts)
   */
  async listCommunityBannedUsers(slug: string, userId: string) {
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
    if (!roles.isLeader) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Community moderator privileges required',
      });
    }

    const [eventBans, hangoutBans] = await Promise.all([
      this.prisma.event_bans.findMany({
        where: { event: { community_id: community.id } },
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
          event: { select: { id: true, title: true } },
        },
      }),
      this.prisma.hangout_bans.findMany({
        where: { hangout: { community_id: community.id } },
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
          hangout: { select: { id: true, title: true } },
        },
      }),
    ]);

    const bannedMap = new Map<string, any>();

    eventBans.forEach((eb) => {
      if (!bannedMap.has(eb.user_id)) {
        bannedMap.set(eb.user_id, {
          user: eb.user,
          bans: [],
        });
      }
      bannedMap.get(eb.user_id).bans.push({
        type: 'event',
        entityId: eb.event_id,
        entityTitle: eb.event.title,
        reason: eb.reason,
        bannedAt: eb.banned_at,
      });
    });

    hangoutBans.forEach((hb) => {
      if (!bannedMap.has(hb.user_id)) {
        bannedMap.set(hb.user_id, {
          user: hb.user,
          bans: [],
        });
      }
      bannedMap.get(hb.user_id).bans.push({
        type: 'hangout',
        entityId: hb.hangout_id,
        entityTitle: hb.hangout.title,
        reason: hb.reason,
        bannedAt: hb.banned_at,
      });
    });

    const result = Array.from(bannedMap.values());
    return {
      data: result,
      total: result.length,
    };
  }
}
