import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const eventQuerySchema = paginationSchema.extend({
  status: z.enum(['proposed', 'approved', 'rejected']).optional(),
  visibility: z.enum(['public', 'community', 'subcommunity']).optional(),
});

export type EventQueryDto = z.infer<typeof eventQuerySchema>;
