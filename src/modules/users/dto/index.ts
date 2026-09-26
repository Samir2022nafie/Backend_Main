import { z } from 'zod';

export const updateUserSchema = z
  .object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().max(50).optional().nullable().or(z.literal('')),
    bio: z.string().max(500).optional(),
    profilePictureUrl: z.string().url('Invalid profile picture URL').optional().nullable().or(z.literal('')),
    locationId: z.string().uuid().optional().nullable(),
    locationName: z.string().trim().max(255).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    isLocationPrivate: z.boolean().optional(),
  })
  .strict();

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
