import {
  createCommentSchema,
  updateCommentSchema,
  commentQuerySchema,
} from './index';

describe('Comments DTO Schemas', () => {
  describe('createCommentSchema', () => {
    it('should validate valid comment content without parent', () => {
      const res = createCommentSchema.safeParse({
        content: 'This is a great trail review.',
      });
      expect(res.success).toBe(true);
    });

    it('should validate valid reply with parentCommentId', () => {
      const res = createCommentSchema.safeParse({
        content: 'I agree with your suggestion!',
        parentCommentId: '11111111-1111-1111-1111-111111111111',
      });
      expect(res.success).toBe(true);
    });

    it('should reject empty or whitespace content', () => {
      const res = createCommentSchema.safeParse({
        content: '   ',
      });
      expect(res.success).toBe(false);
    });

    it('should reject content exceeding 1000 characters', () => {
      const res = createCommentSchema.safeParse({
        content: 'a'.repeat(1001),
      });
      expect(res.success).toBe(false);
    });

    it('should reject invalid UUID for parentCommentId', () => {
      const res = createCommentSchema.safeParse({
        content: 'Valid content',
        parentCommentId: 'not-a-uuid',
      });
      expect(res.success).toBe(false);
    });

    it('should reject extra unrecognized properties (strict schema)', () => {
      const res = createCommentSchema.safeParse({
        content: 'Valid content',
        unknownField: 'not allowed',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updateCommentSchema', () => {
    it('should validate valid update content', () => {
      const res = updateCommentSchema.safeParse({
        content: 'Updated comment text.',
      });
      expect(res.success).toBe(true);
    });

    it('should reject empty update', () => {
      const res = updateCommentSchema.safeParse({});
      expect(res.success).toBe(false);
    });
  });

  describe('commentQuerySchema', () => {
    it('should parse pagination parameters with defaults', () => {
      const res = commentQuerySchema.safeParse({
        page: '2',
        limit: '15',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.page).toBe(2);
        expect(res.data.limit).toBe(15);
      }
    });
  });
});
