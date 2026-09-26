import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const createEventSchema = z
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
    maxParticipants: z.coerce.number().int().min(1, 'maxParticipants must be at least 1').optional(),
    locationId: uuidSchema.optional(),
    location: z.string().trim().max(255).optional().nullable(),
    locationName: z.string().trim().max(255).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
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
  );

export type CreateEventDto = z.infer<typeof createEventSchema>;
