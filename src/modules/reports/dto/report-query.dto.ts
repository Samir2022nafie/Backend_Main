import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const reportQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'reviewing', 'resolved', 'dismissed']).optional(),
});

export type ReportQueryDto = z.infer<typeof reportQuerySchema>;
