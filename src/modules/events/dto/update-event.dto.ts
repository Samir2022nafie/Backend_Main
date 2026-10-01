import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(3000).optional().nullable(),
    coverImageUrl: z.string().optional().nullable().or(z.literal('')),
    cover_image_url: z.string().optional().nullable().or(z.literal('')),
    startsAt: z
      .union([z.string(), z.date()])
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: 'Invalid start date' })
      .transform((val) => (val && String(val).trim() ? new Date(val).toISOString() : undefined))
      .optional(),
    starts_at: z
      .union([z.string(), z.date()])
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: 'Invalid start date' })
      .transform((val) => (val && String(val).trim() ? new Date(val).toISOString() : undefined))
      .optional(),
    endsAt: z
      .union([z.string(), z.date()])
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: 'Invalid end date' })
      .transform((val) => (val && String(val).trim() ? new Date(val).toISOString() : (val === null ? null : undefined)))
      .optional(),
    ends_at: z
      .union([z.string(), z.date()])
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(new Date(val).getTime()), { message: 'Invalid end date' })
      .transform((val) => (val && String(val).trim() ? new Date(val).toISOString() : (val === null ? null : undefined)))
      .optional(),
    visibility: z.enum(['public', 'community', 'subcommunity']).optional(),
    maxParticipants: z.preprocess(
      (val) => (val === null || val === undefined || val === '' ? null : Number(val)),
      z.number().int().min(1, 'maxParticipants must be at least 1').nullable().optional(),
    ),
    max_participants: z.preprocess(
      (val) => (val === null || val === undefined || val === '' ? null : Number(val)),
      z.number().int().min(1, 'maxParticipants must be at least 1').nullable().optional(),
    ),
    locationId: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      uuidSchema.optional().nullable(),
    ),
    location_id: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      uuidSchema.optional().nullable(),
    ),
    location: z.string().trim().max(255).optional().nullable(),
    locationName: z.string().trim().max(255).optional().nullable(),
    location_name: z.string().trim().max(255).optional().nullable(),
    latitude: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
      z.number().min(-90).max(90).nullable().optional(),
    ),
    longitude: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
      z.number().min(-180).max(180).nullable().optional(),
    ),
    subcommunityId: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      uuidSchema.optional().nullable(),
    ),
    subcommunity_id: z.preprocess(
      (val) => (val === '' || val === undefined ? null : val),
      uuidSchema.optional().nullable(),
    ),
  })
  .refine(
    (data) => {
      // Reject Null Island (0,0) in ocean
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
  .refine((data) => Object.values(data).some((val) => val !== undefined), {
    message: 'At least one field must be provided for update',
  })
  .refine(
    (data) => {
      const start = data.startsAt || data.starts_at;
      const end = data.endsAt || data.ends_at;
      if (start && end && new Date(end) <= new Date(start)) {
        return false;
      }
      return true;
    },
    {
      message: 'endsAt must be chronologically after startsAt',
      path: ['endsAt'],
    },
  );

export type UpdateEventDto = z.infer<typeof updateEventSchema>;
