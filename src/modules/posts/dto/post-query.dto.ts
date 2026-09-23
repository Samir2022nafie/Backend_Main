import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const postQuerySchema = paginationSchema.extend({
  sort: z.enum(['created_at', 'popular']).default('created_at').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
  tag: z.string().trim().max(50).optional(),
  q: z.string().trim().max(100).optional(),
});

export type PostQueryDto = z.infer<typeof postQuerySchema>;
