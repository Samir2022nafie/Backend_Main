import { z } from 'zod';

export const upsertLocationSchema = z.object({
  placeName: z.string().min(1, 'Place name is required').max(255),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().max(255).optional().nullable(),
});

export type UpsertLocationDto = z.infer<typeof upsertLocationSchema>;

export interface ResolveLocationInput {
  locationId?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
}
