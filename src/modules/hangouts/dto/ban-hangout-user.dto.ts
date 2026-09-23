import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const banHangoutUserSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export type BanHangoutUserDto = z.infer<typeof banHangoutUserSchema>;
