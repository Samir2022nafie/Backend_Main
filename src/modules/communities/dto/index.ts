import { z } from 'zod';
import { uuidSchema, paginationSchema, slugSchema } from '@/core/utils/zod-utils';

export const createCommunitySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
  slug: slugSchema,
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  rules: z.string().max(5000, 'Rules cannot exceed 5000 characters').optional(),
  categoryId: uuidSchema,
  locationId: uuidSchema.optional(),
  bannerUrl: z.string().url('Invalid banner URL').optional(),
  profilePictureUrl: z.string().url('Invalid profile picture URL').optional(),
  isPrivate: z.boolean().optional().default(false),
});

export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;

export const updateCommunitySchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(1000).optional(),
    rules: z.string().max(5000).optional(),
    bannerUrl: z.string().url().optional(),
    profilePictureUrl: z.string().url().optional(),
    isPrivate: z.boolean().optional(),
  })
  .strict();

export type UpdateCommunityDto = z.infer<typeof updateCommunitySchema>;

export const communityQuerySchema = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  q: z.string().max(100).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().max(1000).optional(), // in km
});

export type CommunityQueryDto = z.infer<typeof communityQuerySchema>;

export * from './member-role.dto';
