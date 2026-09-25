import { z } from 'zod';

export const updateUserSchema = z
  .object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().max(50).optional().nullable().or(z.literal('')),
    bio: z.string().max(500).optional(),
    profilePictureUrl: z.string().url('Invalid profile picture URL').optional().nullable().or(z.literal('')),
  })
  .strict();

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
