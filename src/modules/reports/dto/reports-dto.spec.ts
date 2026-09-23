import {
  createReportSchema,
  updateReportStatusSchema,
  takeModerationActionSchema,
  reportQuerySchema,
} from './index';

describe('Reports DTO Schemas', () => {
  const dummyUuid = '11111111-1111-1111-1111-111111111111';

  describe('createReportSchema', () => {
    it('should validate report with exactly one target (post)', () => {
      const res = createReportSchema.safeParse({
        reason: 'Inappropriate content',
        reportedPostId: dummyUuid,
      });
      expect(res.success).toBe(true);
    });

    it('should validate report with exactly one target (user)', () => {
      const res = createReportSchema.safeParse({
        reason: 'Harassment',
        reportedUserId: dummyUuid,
      });
      expect(res.success).toBe(true);
    });

    it('should reject report with 0 targets', () => {
      const res = createReportSchema.safeParse({
        reason: 'Missing target',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('Exactly one target');
      }
    });

    it('should reject report with multiple targets', () => {
      const res = createReportSchema.safeParse({
        reason: 'Two targets provided',
        reportedPostId: dummyUuid,
        reportedCommentId: dummyUuid,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('Exactly one target');
      }
    });

    it('should reject empty reason', () => {
      const res = createReportSchema.safeParse({
        reason: '   ',
        reportedPostId: dummyUuid,
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updateReportStatusSchema', () => {
    it('should validate allowed statuses', () => {
      expect(updateReportStatusSchema.safeParse({ status: 'reviewing' }).success).toBe(true);
      expect(updateReportStatusSchema.safeParse({ status: 'resolved' }).success).toBe(true);
      expect(updateReportStatusSchema.safeParse({ status: 'dismissed' }).success).toBe(true);
      expect(updateReportStatusSchema.safeParse({ status: 'pending' }).success).toBe(false);
    });
  });

  describe('takeModerationActionSchema', () => {
    it('should validate action type and notes', () => {
      const res = takeModerationActionSchema.safeParse({
        actionType: 'content_removed',
        notes: 'Violated community guidelines',
        targetUserId: dummyUuid,
      });
      expect(res.success).toBe(true);
    });

    it('should reject invalid action type', () => {
      const res = takeModerationActionSchema.safeParse({
        actionType: 'invalid_action',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('reportQuerySchema', () => {
    it('should parse query params', () => {
      const res = reportQuerySchema.safeParse({
        page: '1',
        limit: '15',
        status: 'pending',
      });
      expect(res.success).toBe(true);
    });
  });
});
