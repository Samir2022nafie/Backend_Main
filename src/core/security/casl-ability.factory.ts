import {
  AbilityBuilder,
  CreateAbility,
  createMongoAbility,
  ExtractSubjectType,
  InferSubjects,
  MongoAbility,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type Subjects =
  | 'User'
  | 'Community'
  | 'CommunityMember'
  | 'Post'
  | 'Comment'
  | 'Event'
  | 'Hangout'
  | 'Report'
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;
export const createAppAbility = createMongoAbility as CreateAbility<AppAbility>;

export interface UserCommunityRolesContext {
  ownedCommunityIds: string[];
  adminCommunityIds: string[];
}

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly prisma: PrismaService) {}

  async getUserCommunityRoles(userId: string): Promise<UserCommunityRolesContext> {
    const [owned, memberships] = await Promise.all([
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

    return {
      ownedCommunityIds: owned.map((c) => c.id),
      adminCommunityIds: memberships.map((m) => m.community_id),
    };
  }

  createForUser(user: { id: string }, context?: UserCommunityRolesContext): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    const ownedCommunityIds = context?.ownedCommunityIds || [];
    const adminCommunityIds = context?.adminCommunityIds || [];

    // --- SELF SCOPED RULES ---
    // User can manage own profile
    can('manage', 'User', { id: user.id } as any);

    // User can manage own posts & comments
    can('manage', 'Post', { author_id: user.id } as any);
    can('manage', 'Comment', { author_id: user.id } as any);
    can('manage', 'Event', { creator_id: user.id } as any);
    can('manage', 'Hangout', { creator_id: user.id } as any);

    // --- ANY AUTHENTICATED USER RULES ---
    can('read', 'Community');
    can('create', 'Community');
    can('create', 'Post');
    can('create', 'Comment');
    can('create', 'Event');
    can('create', 'Hangout');
    can('create', 'Report');

    // --- ADMIN / MODERATOR SCOPED RULES ---
    if (adminCommunityIds.length > 0) {
      can('manage', 'Post', { community_id: { $in: adminCommunityIds } } as any);
      can('manage', 'Comment', { community_id: { $in: adminCommunityIds } } as any);
      can('manage', 'Event', { community_id: { $in: adminCommunityIds } } as any);
      can('manage', 'Hangout', { community_id: { $in: adminCommunityIds } } as any);
      can('manage', 'Report', { community_id: { $in: adminCommunityIds } } as any);
      can('read', 'CommunityMember', { community_id: { $in: adminCommunityIds } } as any);
      can('delete', 'CommunityMember', { community_id: { $in: adminCommunityIds } } as any);
    }

    // --- OWNER SCOPED RULES ---
    if (ownedCommunityIds.length > 0) {
      can('update', 'Community', { id: { $in: ownedCommunityIds } } as any);
      can('delete', 'Community', { id: { $in: ownedCommunityIds } } as any);
      can('manage', 'CommunityMember', { community_id: { $in: ownedCommunityIds } } as any);
      can('manage', 'Post', { community_id: { $in: ownedCommunityIds } } as any);
      can('manage', 'Comment', { community_id: { $in: ownedCommunityIds } } as any);
      can('manage', 'Event', { community_id: { $in: ownedCommunityIds } } as any);
      can('manage', 'Hangout', { community_id: { $in: ownedCommunityIds } } as any);
      can('manage', 'Report', { community_id: { $in: ownedCommunityIds } } as any);
    }

    return build({
      detectSubjectType: (item: any) => {
        if (typeof item === 'string') return item as Subjects;
        return (item.__caslSubjectType__ || item.constructor.name) as Subjects;
      },
    });
  }
}
