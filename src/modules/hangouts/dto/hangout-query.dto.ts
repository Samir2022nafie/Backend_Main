import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const hangoutQuerySchema = paginationSchema.extend({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(),
});

export type HangoutQueryDto = z.infer<typeof hangoutQuerySchema>;
