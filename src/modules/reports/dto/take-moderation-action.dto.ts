import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const takeModerationActionSchema = z.object({
  actionType: z.enum(
    [
      'warn',
      'suspend',
      'ban',
      'unban',
      'content_removed',
      'content_restored',
      'promote_moderator',
      'demote_moderator',
    ],
    {
      required_error: 'actionType is required',
    },
  ),
  notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
  targetUserId: uuidSchema.optional(),
});

export type TakeModerationActionDto = z.infer<typeof takeModerationActionSchema>;
