import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const createHangoutSchema = z
  .object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title cannot be empty')
      .max(150, 'Title cannot exceed 150 characters'),
    description: z
      .string()
      .trim()
      .max(3000, 'Description cannot exceed 3000 characters')
      .optional(),
    coverImageUrl: z.string().url('Invalid cover image URL').optional().nullable().or(z.literal('')),
    startsAt: z
      .string({ required_error: 'startsAt is required' })
      .datetime({ message: 'startsAt must be a valid ISO 8601 date string' }),
    endsAt: z
      .string()
      .datetime({ message: 'endsAt must be a valid ISO 8601 date string' })
      .optional(),
    visibility: z.enum(['public', 'community', 'subcommunity']).default('public').optional(),
    joinType: z.enum(['open', 'request_based']).default('open').optional(),
    maxParticipants: z.coerce.number().int().min(1, 'maxParticipants must be at least 1').optional(),
    communityId: uuidSchema.optional(),
    locationId: uuidSchema.optional(),
    subcommunityId: uuidSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
        return false;
      }
      return true;
    },
    {
      message: 'endsAt must be chronologically after startsAt',
      path: ['endsAt'],
    },
  )
  .refine(
    (data) => {
      if (!data.communityId && data.visibility && data.visibility !== 'public') {
        return false;
      }
      return true;
    },
    {
      message: 'Standalone hangouts can only have public visibility',
      path: ['visibility'],
    },
  );

export type CreateHangoutDto = z.infer<typeof createHangoutSchema>;
