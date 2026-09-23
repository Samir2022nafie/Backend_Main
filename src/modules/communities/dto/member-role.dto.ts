import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const communityRoleEnum = z.enum(['member', 'moderator', 'admin']);
export type CommunityRole = z.infer<typeof communityRoleEnum>;

export const updateMemberRoleSchema = z
  .object({
    role: communityRoleEnum,
  })
  .strict();

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;

export const listMembersQuerySchema = paginationSchema.extend({
  role: communityRoleEnum.optional(),
  q: z.string().max(100).optional(),
});

export type ListMembersQueryDto = z.infer<typeof listMembersQuerySchema>;
