import { z } from 'zod';

export const presignedUploadSchema = z.object({
  filename: z
    .string({ required_error: 'Filename is required' })
    .trim()
    .min(1, 'Filename cannot be empty')
    .max(255, 'Filename cannot exceed 255 characters'),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4'], {
    required_error: 'contentType is required and must be image/jpeg, image/png, image/webp, or video/mp4',
  }),
});

export type PresignedUploadDto = z.infer<typeof presignedUploadSchema>;
