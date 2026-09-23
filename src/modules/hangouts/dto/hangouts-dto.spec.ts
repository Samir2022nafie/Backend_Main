import {
  createHangoutSchema,
  updateHangoutSchema,
  hangoutQuerySchema,
  respondHangoutRequestSchema,
  banHangoutUserSchema,
} from './index';

describe('Hangouts DTO Schemas', () => {
  const validStart = '2026-10-15T18:00:00.000Z';
  const validEnd = '2026-10-15T21:00:00.000Z';

  describe('createHangoutSchema', () => {
    it('should validate standalone public hangout', () => {
      const res = createHangoutSchema.safeParse({
        title: 'Board Games Evening',
        startsAt: validStart,
        endsAt: validEnd,
        visibility: 'public',
        joinType: 'open',
        maxParticipants: 8,
      });

      expect(res.success).toBe(true);
    });

    it('should reject standalone hangout with community visibility', () => {
      const res = createHangoutSchema.safeParse({
        title: 'Community Only Without Community',
        startsAt: validStart,
        visibility: 'community',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('Standalone hangouts can only have public visibility');
      }
    });

    it('should allow community-tied hangout with community visibility', () => {
      const res = createHangoutSchema.safeParse({
        title: 'Club Board Games',
        startsAt: validStart,
        communityId: '11111111-1111-1111-1111-111111111111',
        visibility: 'community',
      });

      expect(res.success).toBe(true);
    });

    it('should reject endsAt <= startsAt', () => {
      const res = createHangoutSchema.safeParse({
        title: 'Reverse Time Hangout',
        startsAt: validEnd,
        endsAt: validStart,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('endsAt must be chronologically after startsAt');
      }
    });
  });

  describe('updateHangoutSchema', () => {
    it('should validate partial update', () => {
      const res = updateHangoutSchema.safeParse({
        title: 'Updated Board Games Night',
        maxParticipants: 12,
      });

      expect(res.success).toBe(true);
    });

    it('should reject empty update', () => {
      const res = updateHangoutSchema.safeParse({});
      expect(res.success).toBe(false);
    });
  });

  describe('hangoutQuerySchema', () => {
    it('should parse pagination and coordinates', () => {
      const res = hangoutQuerySchema.safeParse({
        page: '1',
        limit: '20',
        lat: '40.7128',
        lng: '-74.0060',
        radius: '10',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.lat).toBe(40.7128);
        expect(res.data.lng).toBe(-74.006);
        expect(res.data.radius).toBe(10);
      }
    });
  });

  describe('respondHangoutRequestSchema', () => {
    it('should validate approved or rejected', () => {
      expect(respondHangoutRequestSchema.safeParse({ status: 'approved' }).success).toBe(true);
      expect(respondHangoutRequestSchema.safeParse({ status: 'rejected' }).success).toBe(true);
      expect(respondHangoutRequestSchema.safeParse({ status: 'pending' }).success).toBe(false);
    });
  });

  describe('banHangoutUserSchema', () => {
    it('should validate ban payload', () => {
      const res = banHangoutUserSchema.safeParse({
        userId: '11111111-1111-1111-1111-111111111111',
        reason: 'Spamming join requests',
      });

      expect(res.success).toBe(true);
    });
  });
});
