import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export type NotificationQueryDto = z.infer<typeof notificationQuerySchema>;
