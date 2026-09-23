import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METADATA_KEYS } from '../common/constants';
import { ErrorCode } from '../common/enums';
import { CaslAbilityFactory } from '../security/casl-ability.factory';
import { PolicyHandler } from '../decorators/require-permissions.decorator';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CaslPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(METADATA_KEYS.POLICIES, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (policyHandlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Authentication required for policy check',
      });
    }

    // Fetch user's community roles context
    const [owned, memberships] = await Promise.all([
      this.prisma.communities.findMany({
        where: { creator_id: user.id, deleted_at: null },
        select: { id: true },
      }),
      this.prisma.community_members.findMany({
        where: {
          user_id: user.id,
          role: { in: ['admin', 'moderator'] },
          community: { deleted_at: null },
        },
        select: { community_id: true },
      }),
    ]);

    const ownedCommunityIds = owned.map((c) => c.id);
    const adminCommunityIds = [
      ...new Set([...ownedCommunityIds, ...memberships.map((m) => m.community_id)]),
    ];

    const ability = this.caslAbilityFactory.createForUser(
      { id: user.id },
      { ownedCommunityIds, adminCommunityIds },
    );

    const hasPermission = policyHandlers.every((handler) => handler(ability));

    if (!hasPermission) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Insufficient permissions',
      });
    }

    return true;
  }
}
