import {
  createEventSchema,
  updateEventSchema,
  eventQuerySchema,
  banEventUserSchema,
  rejectEventSchema,
} from './index';

describe('Events DTO Schemas', () => {
  const validStart = '2026-10-10T10:00:00.000Z';
  const validEnd = '2026-10-10T14:00:00.000Z';

  describe('createEventSchema', () => {
    it('should validate valid event payload', () => {
      const res = createEventSchema.safeParse({
        title: 'Autumn Trail Hike',
        description: 'Enjoying the changing colors on the mountain.',
        startsAt: validStart,
        endsAt: validEnd,
        visibility: 'public',
        maxParticipants: 25,
      });

      expect(res.success).toBe(true);
    });

    it('should reject when endsAt is earlier than startsAt', () => {
      const res = createEventSchema.safeParse({
        title: 'Time Travel Event',
        startsAt: validEnd,
        endsAt: validStart, // earlier
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('endsAt must be chronologically after startsAt');
      }
    });

    it('should reject invalid startsAt date format', () => {
      const res = createEventSchema.safeParse({
        title: 'Bad Date',
        startsAt: 'tomorrow-morning',
      });

      expect(res.success).toBe(false);
    });

    it('should reject maxParticipants < 1', () => {
      const res = createEventSchema.safeParse({
        title: 'Zero People',
        startsAt: validStart,
        maxParticipants: 0,
      });

      expect(res.success).toBe(false);
    });
  });

  describe('updateEventSchema', () => {
    it('should validate partial update', () => {
      const res = updateEventSchema.safeParse({
        title: 'Updated Event Title',
        maxParticipants: 50,
      });

      expect(res.success).toBe(true);
    });

    it('should reject empty update', () => {
      const res = updateEventSchema.safeParse({});
      expect(res.success).toBe(false);
    });

    it('should reject when updated endsAt is before startsAt', () => {
      const res = updateEventSchema.safeParse({
        startsAt: validEnd,
        endsAt: validStart,
      });

      expect(res.success).toBe(false);
    });
  });

  describe('eventQuerySchema', () => {
    it('should parse query parameters', () => {
      const res = eventQuerySchema.safeParse({
        page: '1',
        limit: '10',
        status: 'approved',
        visibility: 'community',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe('approved');
        expect(res.data.visibility).toBe('community');
      }
    });
  });

  describe('banEventUserSchema', () => {
    it('should validate valid ban payload', () => {
      const res = banEventUserSchema.safeParse({
        userId: '11111111-1111-1111-1111-111111111111',
        reason: 'Violated code of conduct',
      });

      expect(res.success).toBe(true);
    });

    it('should reject invalid userId UUID', () => {
      const res = banEventUserSchema.safeParse({
        userId: 'invalid-id',
      });

      expect(res.success).toBe(false);
    });
  });

  describe('rejectEventSchema', () => {
    it('should validate rejection with or without reason', () => {
      const res1 = rejectEventSchema.safeParse({ reason: 'Does not fit community guidelines' });
      const res2 = rejectEventSchema.safeParse({});

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
    });
  });
});
