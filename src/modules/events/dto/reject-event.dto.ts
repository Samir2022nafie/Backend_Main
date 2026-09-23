import { z } from 'zod';

export const rejectEventSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type RejectEventDto = z.infer<typeof rejectEventSchema>;
