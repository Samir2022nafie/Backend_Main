import {
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
} from './index';

describe('Posts DTO Schemas', () => {
  describe('createPostSchema', () => {
    it('should validate with title only', () => {
      const res = createPostSchema.safeParse({
        title: 'Exciting Community Update',
      });
      expect(res.success).toBe(true);
    });

    it('should validate with content only', () => {
      const res = createPostSchema.safeParse({
        content: 'This is the main post content describing an adventure.',
      });
      expect(res.success).toBe(true);
    });

    it('should validate with mediaUrl only', () => {
      const res = createPostSchema.safeParse({
        mediaUrl: 'https://example.com/photo.jpg',
      });
      expect(res.success).toBe(true);
    });

    it('should validate with full payload including tags', () => {
      const res = createPostSchema.safeParse({
        title: 'Morning Hike',
        content: 'Met at 6am on the trail.',
        mediaUrl: 'https://example.com/hike.jpg',
        tags: ['hiking', 'sunrise'],
      });
      expect(res.success).toBe(true);
    });

    it('should reject when neither title, content, nor mediaUrl is provided', () => {
      const res = createPostSchema.safeParse({
        tags: ['empty'],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('At least one of title, content, or mediaUrl is required');
      }
    });

    it('should reject invalid mediaUrl', () => {
      const res = createPostSchema.safeParse({
        content: 'Valid content',
        mediaUrl: 'not-a-url',
      });
      expect(res.success).toBe(false);
    });

    it('should reject title exceeding 150 characters', () => {
      const res = createPostSchema.safeParse({
        title: 'a'.repeat(151),
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updatePostSchema', () => {
    it('should validate partial update with title', () => {
      const res = updatePostSchema.safeParse({
        title: 'Updated Title',
      });
      expect(res.success).toBe(true);
    });

    it('should validate nullifying mediaUrl', () => {
      const res = updatePostSchema.safeParse({
        mediaUrl: null,
      });
      expect(res.success).toBe(true);
    });

    it('should reject empty update object', () => {
      const res = updatePostSchema.safeParse({});
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('At least one field must be provided');
      }
    });
  });

  describe('postQuerySchema', () => {
    it('should parse query parameters and apply defaults', () => {
      const res = postQuerySchema.safeParse({
        page: '2',
        limit: '25',
        sort: 'popular',
        order: 'asc',
        tag: 'climbing',
        q: 'mountain',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.page).toBe(2);
        expect(res.data.limit).toBe(25);
        expect(res.data.sort).toBe('popular');
        expect(res.data.order).toBe('asc');
        expect(res.data.tag).toBe('climbing');
        expect(res.data.q).toBe('mountain');
      }
    });
  });
});
