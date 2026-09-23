import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const createCommentSchema = z
  .object({
    content: z
      .string({ required_error: 'Content is required' })
      .trim()
      .min(1, 'Content cannot be empty')
      .max(1000, 'Content cannot exceed 1000 characters'),
    parentCommentId: uuidSchema.optional(),
  })
  .strict();

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
