import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const updateHangoutSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(3000).optional().nullable(),
    coverImageUrl: z.string().url().optional().nullable().or(z.literal('')),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional().nullable(),
    visibility: z.enum(['public', 'community', 'subcommunity']).optional(),
    joinType: z.enum(['open', 'request_based']).optional(),
    maxParticipants: z.coerce.number().int().min(1).optional().nullable(),
    locationId: uuidSchema.optional().nullable(),
    subcommunityId: uuidSchema.optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
        return false;
      }
      return true;
    },
    {
      message: 'endsAt must be chronologically after startsAt',
      path: ['endsAt'],
    },
  );

export type UpdateHangoutDto = z.infer<typeof updateHangoutSchema>;
