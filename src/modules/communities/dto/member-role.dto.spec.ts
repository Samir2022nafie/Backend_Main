import {
  updateMemberRoleSchema,
  listMembersQuerySchema,
} from './member-role.dto';

describe('Member Role DTO Schemas', () => {
  describe('updateMemberRoleSchema', () => {
    it('should validate valid roles (member, moderator, admin)', () => {
      const validRoles = ['member', 'moderator', 'admin'];
      for (const role of validRoles) {
        const res = updateMemberRoleSchema.safeParse({ role });
        expect(res.success).toBe(true);
      }
    });

    it('should reject invalid role strings', () => {
      const invalidRoles = ['owner', 'superadmin', 'guest', ''];
      for (const role of invalidRoles) {
        const res = updateMemberRoleSchema.safeParse({ role });
        expect(res.success).toBe(false);
      }
    });

    it('should reject extra unrecognized fields (strict schema)', () => {
      const res = updateMemberRoleSchema.safeParse({
        role: 'moderator',
        extraField: 'not-allowed',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('listMembersQuerySchema', () => {
    it('should parse valid query filters', () => {
      const res = listMembersQuerySchema.safeParse({
        page: '2',
        limit: '30',
        role: 'admin',
        q: 'john',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.page).toBe(2);
        expect(res.data.limit).toBe(30);
        expect(res.data.role).toBe('admin');
        expect(res.data.q).toBe('john');
      }
    });
  });
});
