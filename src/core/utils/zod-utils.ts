import { z } from 'zod';

/**
 * Shared primitive Zod schemas used across controllers and modules
 */

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(120, 'Slug cannot exceed 120 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric separated by single hyphens');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationDto = z.infer<typeof paginationSchema>;

export const sortingSchema = z.object({
  sort: z.string().optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});
