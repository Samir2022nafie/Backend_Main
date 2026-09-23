import { z } from 'zod';

export const updateCommentSchema = z
  .object({
    content: z
      .string({ required_error: 'Content is required' })
      .trim()
      .min(1, 'Content cannot be empty')
      .max(1000, 'Content cannot exceed 1000 characters'),
  })
  .strict();

export type UpdateCommentDto = z.infer<typeof updateCommentSchema>;
