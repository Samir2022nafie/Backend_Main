import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';
import { ErrorCode } from '@/core/common/enums';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: validates that community exists and caller is owner, admin, or moderator.
   */
  private async validateAdminAccess(slug: string, callerId: string) {
    const community = await this.prisma.communities.findFirst({
      where: { slug, deleted_at: null },
      include: {
        category: {
          select: { id: true, name: true },
        },
        location: {
          select: { id: true, place_name: true, latitude: true, longitude: true },
        },
      },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    const isOwner = community.creator_id === callerId;
    if (isOwner) {
      return { community, role: 'owner' as const };
    }

    const membership = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: callerId,
        },
      },
    });

    if (!membership || (membership.role !== 'admin' && membership.role !== 'moderator')) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only community administrators, moderators, and the owner can access this resource',
      });
    }

    return { community, role: membership.role as 'admin' | 'moderator' };
  }

  /**
   * Get community admin overview
   */
  async getCommunityOverview(slug: string, callerId: string) {
    const { community, role } = await this.validateAdminAccess(slug, callerId);

    const memberCount = await this.prisma.community_members.count({
      where: {
        community_id: community.id,
        user: { deleted_at: null },
      },
    });

    return {
      community,
      myRole: role,
      memberCount,
    };
  }

  /**
   * Get community aggregated metrics/stats
   */
  async getCommunityStats(slug: string, callerId: string) {
    const { community } = await this.validateAdminAccess(slug, callerId);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalMembers,
      totalPosts,
      totalEvents,
      pendingReports,
      pendingEvents,
      newMembersThisWeek,
    ] = await Promise.all([
      this.prisma.community_members.count({
        where: {
          community_id: community.id,
          user: { deleted_at: null },
        },
      }),
      this.prisma.posts.count({
        where: {
          community_id: community.id,
          deleted_at: null,
        },
      }),
      this.prisma.events.count({
        where: {
          community_id: community.id,
          deleted_at: null,
        },
      }),
      this.prisma.reports.count({
        where: {
          status: 'pending',
          OR: [
            { post: { community_id: community.id } },
            { event: { community_id: community.id } },
            { comment: { post: { community_id: community.id } } },
            { hangout: { community_id: community.id } },
          ],
        },
      }),
      this.prisma.events.count({
        where: {
          community_id: community.id,
          approval_status: 'proposed',
          deleted_at: null,
        },
      }),
      this.prisma.community_members.count({
        where: {
          community_id: community.id,
          joined_at: { gte: sevenDaysAgo },
          user: { deleted_at: null },
        },
      }),
    ]);

    return {
      totalMembers,
      totalPosts,
      totalEvents,
      pendingReports,
      pendingEvents,
      newMembersThisWeek,
    };
  }
}
