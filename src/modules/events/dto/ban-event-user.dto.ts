import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const banEventUserSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export type BanEventUserDto = z.infer<typeof banEventUserSchema>;
