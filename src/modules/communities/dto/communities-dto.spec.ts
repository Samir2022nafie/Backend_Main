import {
  createCommunitySchema,
  updateCommunitySchema,
  communityQuerySchema,
} from './index';

describe('Communities DTO Validation Schemas', () => {
  const validCategoryId = '11111111-1111-1111-1111-111111111111';

  describe('createCommunitySchema', () => {
    it('should validate a valid community creation payload', () => {
      const payload = {
        name: 'Photography Club',
        slug: 'photography-club',
        description: 'For photographers of all skill levels',
        rules: 'Be respectful. Share your own photos.',
        categoryId: validCategoryId,
        bannerUrl: 'https://example.com/banner.jpg',
        profilePictureUrl: 'https://example.com/avatar.jpg',
        isPrivate: false,
      };

      const result = createCommunitySchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid slug formats (uppercase, spaces, special symbols)', () => {
      const invalidSlugs = ['Photography Club', 'photo_club', '-photo', 'photo-', 'photo--club'];
      for (const slug of invalidSlugs) {
        const result = createCommunitySchema.safeParse({
          name: 'Photography Club',
          slug,
          categoryId: validCategoryId,
        });
        expect(result.success).toBe(false);
      }
    });

    it('should reject invalid categoryId uuid', () => {
      const result = createCommunitySchema.safeParse({
        name: 'Photography Club',
        slug: 'photography-club',
        categoryId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateCommunitySchema', () => {
    it('should validate valid update fields', () => {
      const result = updateCommunitySchema.safeParse({
        name: 'Updated Name',
        description: 'Updated Description',
        isPrivate: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject attempts to update slug or categoryId (strict schema)', () => {
      const resultWithSlug = updateCommunitySchema.safeParse({
        slug: 'new-slug',
      });
      expect(resultWithSlug.success).toBe(false);

      const resultWithCategory = updateCommunitySchema.safeParse({
        categoryId: validCategoryId,
      });
      expect(resultWithCategory.success).toBe(false);
    });
  });

  describe('communityQuerySchema', () => {
    it('should parse valid pagination and filter query params', () => {
      const result = communityQuerySchema.safeParse({
        page: '2',
        limit: '15',
        categoryId: validCategoryId,
        q: 'photo',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(15);
        expect(result.data.q).toBe('photo');
      }
    });
  });
});
