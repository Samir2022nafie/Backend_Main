import { z } from 'zod';

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    content: z.string().trim().min(1).max(10000).optional(),
    mediaUrl: z.string().url().optional().nullable().or(z.literal('')),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(10)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdatePostDto = z.infer<typeof updatePostSchema>;
