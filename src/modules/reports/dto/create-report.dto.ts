import { z } from 'zod';
import { uuidSchema } from '@/core/utils/zod-utils';

export const createReportSchema = z
  .object({
    reason: z
      .string({ required_error: 'Reason is required' })
      .trim()
      .min(1, 'Reason cannot be empty')
      .max(500, 'Reason cannot exceed 500 characters'),
    reportedUserId: uuidSchema.optional(),
    reportedPostId: uuidSchema.optional(),
    reportedCommentId: uuidSchema.optional(),
    reportedEventId: uuidSchema.optional(),
    reportedHangoutId: uuidSchema.optional(),
  })
  .refine(
    (data) => {
      const targets = [
        data.reportedUserId,
        data.reportedPostId,
        data.reportedCommentId,
        data.reportedEventId,
        data.reportedHangoutId,
      ].filter((t) => t !== undefined && t !== null);

      return targets.length === 1;
    },
    {
      message:
        'Exactly one target (reportedUserId, reportedPostId, reportedCommentId, reportedEventId, or reportedHangoutId) must be provided',
      path: ['reportedUserId'],
    },
  );

export type CreateReportDto = z.infer<typeof createReportSchema>;
