import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { METADATA_KEYS } from '../common/constants';
import { CommunityRole, ErrorCode } from '../common/enums';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CommunityRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<CommunityRole[]>(
      METADATA_KEYS.ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Authentication required for this action',
      });
    }

    // Community identifier can come from params: slug or communityId or id
    const rawSlug = request.params?.slug;
    const rawCommunityId = request.params?.communityId || request.params?.id;
    const slug = typeof rawSlug === 'string' ? rawSlug : undefined;
    const communityId = typeof rawCommunityId === 'string' ? rawCommunityId : undefined;

    if (!slug && !communityId) {
      return true;
    }

    // Fetch community
    const community = await this.prisma.communities.findFirst({
      where: {
        ...(slug ? { slug } : { id: communityId }),
        deleted_at: null,
      },
      select: {
        id: true,
        creator_id: true,
      },
    });

    if (!community) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Community not found',
      });
    }

    // Attach community to request context for convenience
    (request as any).community = community;

    const isOwner = community.creator_id === user.id;

    // Owner satisfies OWNER, ADMIN, MODERATOR, and MEMBER
    if (isOwner) {
      return true;
    }

    // If only OWNER was required and user is not owner
    if (requiredRoles.length === 1 && requiredRoles.includes(CommunityRole.OWNER)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the community owner can perform this action',
      });
    }

    // Check community_members table for role
    const membership = await this.prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not a member of this community',
      });
    }

    // Attach membership to request context
    (request as any).membership = membership;

    // Check if membership role satisfies requirements
    const userRole = membership.role as CommunityRole;

    const hasRole = requiredRoles.some((role) => {
      if (role === CommunityRole.MEMBER) return true;
      if (role === CommunityRole.MODERATOR) {
        return userRole === CommunityRole.MODERATOR || userRole === CommunityRole.ADMIN;
      }
      if (role === CommunityRole.ADMIN) {
        return userRole === CommunityRole.ADMIN;
      }
      return false;
    });

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient community permissions',
      });
    }

    return true;
  }
}
