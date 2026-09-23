import { z } from 'zod';

export const updateReportStatusSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed'], {
    required_error: 'Status is required and must be reviewing, resolved, or dismissed',
  }),
});

export type UpdateReportStatusDto = z.infer<typeof updateReportStatusSchema>;
