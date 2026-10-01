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
      .optional()
      .nullable(),
    coverImageUrl: z.string().optional().nullable().or(z.literal('')),
    startsAt: z
      .union([z.string(), z.date()])
      .refine((val) => !isNaN(new Date(val).getTime()), { message: 'Invalid start date' })
      .transform((val) => new Date(val).toISOString()),
    endsAt: z
      .union([z.string(), z.date()])
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: 'Invalid end date' })
      .transform((val) => (val && String(val).trim() ? new Date(val).toISOString() : null))
      .optional(),
    visibility: z.enum(['public', 'community', 'subcommunity']).default('public').optional(),
    joinType: z.enum(['open', 'request_based']).default('open').optional(),
    maxParticipants: z.coerce.number().int().min(1, 'maxParticipants must be at least 1').optional().nullable(),
    communityId: uuidSchema.optional().nullable(),
    subcommunityId: uuidSchema.optional().nullable(),
    categoryId: uuidSchema.optional().nullable(),
    category_id: uuidSchema.optional().nullable(),
    locationId: uuidSchema.optional().nullable(),
    location: z.string().trim().max(255).optional().nullable(),
    locationName: z.string().trim().max(255).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
  })
  .refine(
    (data) => {
      // Reject Null Island (0,0) in the middle of the Atlantic ocean
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        if (Math.abs(data.latitude) < 0.0001 && Math.abs(data.longitude) < 0.0001) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Location cannot be set in the ocean',
      path: ['latitude'],
    },
  )
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
