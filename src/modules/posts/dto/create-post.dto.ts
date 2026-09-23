import { z } from 'zod';

export const createPostSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    content: z.string().trim().min(1).max(10000).optional(),
    mediaUrl: z.string().url().optional().nullable().or(z.literal('')),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(10)
      .optional(),
  })
  .refine((data) => !!(data.title || data.content || (data.mediaUrl && data.mediaUrl.trim())), {
    message: 'At least one of title, content, or mediaUrl is required',
    path: ['content'],
  });

export type CreatePostDto = z.infer<typeof createPostSchema>;
