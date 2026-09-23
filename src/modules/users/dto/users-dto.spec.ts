import { updateUserSchema } from './index';

describe('Users DTO Validation Schemas', () => {
  it('should validate valid profile updates', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Doe',
      bio: 'Lover of hobbies and outdoors.',
      profilePictureUrl: 'https://example.com/jane.jpg',
    });

    expect(result.success).toBe(true);
  });

  it('should reject unknown extra fields in updateUserSchema (strict)', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Jane',
      email: 'hacked@example.com',
    });

    expect(result.success).toBe(false);
  });
});
