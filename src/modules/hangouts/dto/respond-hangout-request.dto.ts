import { z } from 'zod';

export const respondHangoutRequestSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    required_error: 'Status is required and must be either approved or rejected',
  }),
});

export type RespondHangoutRequestDto = z.infer<typeof respondHangoutRequestSchema>;
