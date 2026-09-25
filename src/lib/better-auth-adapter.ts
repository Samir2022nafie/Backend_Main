/**
 * Custom Better Auth Database Adapter
 *
 * Maps between Better Auth's camelCase model expectations and our
 * snake_case Prisma schema. This adapter lets Better Auth read/write
 * to our existing database without requiring schema changes.
 *
 * Model mapping:
 *   Better Auth "user"         → Prisma "users"
 *   Better Auth "session"      → Prisma "sessions"
 *   Better Auth "account"      → Prisma "user_external_accounts"
 *   Better Auth "verification" → Prisma "verification"
 */

// ─── Field Mapping Tables ─────────────────────────────────────────────────────

/** Better Auth camelCase → Prisma snake_case field name mapping per model */
const USER_TO_DB: Record<string, string> = {
  id: 'id',
  name: 'name',
  email: 'email',
  emailVerified: 'email_verified',
  image: 'profile_picture_url',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // username plugin
  username: 'username',
  displayUsername: 'username', // We don't have a separate displayUsername
  // phone plugin
  phoneNumber: 'phone_number',
  phoneNumberVerified: 'phone_number_verified',
  // Custom fields
  firstName: 'first_name',
  first_name: 'first_name',
  lastName: 'last_name',
  last_name: 'last_name',
  birthDate: 'birth_date',
  birth_date: 'birth_date',
  bio: 'bio',
  profilePictureUrl: 'profile_picture_url',
  trustScore: 'trust_score',
  deletedAt: 'deleted_at',
};

const DB_TO_USER: Record<string, string> = {};
for (const [k, v] of Object.entries(USER_TO_DB)) {
  // Prefer camelCase keys when reversing
  if (!DB_TO_USER[v] || k.length > DB_TO_USER[v].length) {
    DB_TO_USER[v] = k;
  }
}
// Explicit overrides for the reverse mapping
DB_TO_USER['email_verified'] = 'emailVerified';
DB_TO_USER['profile_picture_url'] = 'image';
DB_TO_USER['created_at'] = 'createdAt';
DB_TO_USER['updated_at'] = 'updatedAt';
DB_TO_USER['first_name'] = 'firstName';
DB_TO_USER['last_name'] = 'lastName';
DB_TO_USER['birth_date'] = 'birthDate';
DB_TO_USER['phone_number'] = 'phoneNumber';
DB_TO_USER['phone_number_verified'] = 'phoneNumberVerified';
DB_TO_USER['trust_score'] = 'trustScore';
DB_TO_USER['deleted_at'] = 'deletedAt';

const SESSION_TO_DB: Record<string, string> = {
  id: 'id',
  token: 'token',
  userId: 'user_id',
  expiresAt: 'expires_at',
  ipAddress: 'ip_address',
  userAgent: 'user_agent',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const DB_TO_SESSION: Record<string, string> = {
  id: 'id',
  token: 'token',
  user_id: 'userId',
  expires_at: 'expiresAt',
  ip_address: 'ipAddress',
  user_agent: 'userAgent',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

const ACCOUNT_TO_DB: Record<string, string> = {
  id: 'id',
  accountId: 'provider_user_id',
  providerId: 'provider',
  userId: 'user_id',
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  idToken: 'id_token',
  accessTokenExpiresAt: 'access_token_expires_at',
  refreshTokenExpiresAt: 'refresh_token_expires_at',
  scope: 'scope',
  password: 'password',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const DB_TO_ACCOUNT: Record<string, string> = {
  id: 'id',
  provider_user_id: 'accountId',
  provider: 'providerId',
  user_id: 'userId',
  access_token: 'accessToken',
  refresh_token: 'refreshToken',
  id_token: 'idToken',
  access_token_expires_at: 'accessTokenExpiresAt',
  refresh_token_expires_at: 'refreshTokenExpiresAt',
  scope: 'scope',
  password: 'password',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

const VERIFICATION_TO_DB: Record<string, string> = {
  id: 'id',
  identifier: 'identifier',
  value: 'value',
  expiresAt: 'expires_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const DB_TO_VERIFICATION: Record<string, string> = {
  id: 'id',
  identifier: 'identifier',
  value: 'value',
  expires_at: 'expiresAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

// ─── Model name mapping ───────────────────────────────────────────────────────

const MODEL_TO_PRISMA: Record<string, string> = {
  user: 'users',
  session: 'sessions',
  account: 'user_external_accounts',
  verification: 'verification',
};

const TO_DB_MAPS: Record<string, Record<string, string>> = {
  user: USER_TO_DB,
  session: SESSION_TO_DB,
  account: ACCOUNT_TO_DB,
  verification: VERIFICATION_TO_DB,
};

const FROM_DB_MAPS: Record<string, Record<string, string>> = {
  user: DB_TO_USER,
  session: DB_TO_SESSION,
  account: DB_TO_ACCOUNT,
  verification: DB_TO_VERIFICATION,
};

// ─── Mapping Helpers ──────────────────────────────────────────────────────────

function mapFieldsToDb(model: string, data: Record<string, any>): Record<string, any> {
  const map = TO_DB_MAPS[model];
  if (!map) return data;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const dbKey = map[key] || key;
    result[dbKey] = value;
  }
  return result;
}

function mapFieldsFromDb(model: string, data: Record<string, any> | null): Record<string, any> | null {
  if (!data) return null;
  const map = FROM_DB_MAPS[model];
  if (!map) return data;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const camelKey = map[key] || key;
    result[camelKey] = value;
  }
  return result;
}

function mapWhereToDb(model: string, where: any[]): Record<string, any> {
  const map = TO_DB_MAPS[model];
  if (!map || !where || where.length === 0) return {};

  const prismaWhere: Record<string, any> = {};
  for (const condition of where) {
    const dbField = map[condition.field] || condition.field;
    if (condition.operator === 'eq' || !condition.operator) {
      prismaWhere[dbField] = condition.value;
    } else if (condition.operator === 'in') {
      prismaWhere[dbField] = { in: condition.value };
    } else if (condition.operator === 'contains') {
      prismaWhere[dbField] = { contains: condition.value, mode: 'insensitive' };
    } else if (condition.operator === 'starts_with') {
      prismaWhere[dbField] = { startsWith: condition.value };
    } else if (condition.operator === 'ends_with') {
      prismaWhere[dbField] = { endsWith: condition.value };
    } else if (condition.operator === 'gt') {
      prismaWhere[dbField] = { gt: condition.value };
    } else if (condition.operator === 'gte') {
      prismaWhere[dbField] = { gte: condition.value };
    } else if (condition.operator === 'lt') {
      prismaWhere[dbField] = { lt: condition.value };
    } else if (condition.operator === 'lte') {
      prismaWhere[dbField] = { lte: condition.value };
    } else if (condition.operator === 'ne') {
      prismaWhere[dbField] = { not: condition.value };
    } else {
      prismaWhere[dbField] = condition.value;
    }
  }
  return prismaWhere;
}

function mapSortByToDb(model: string, sortBy?: { field: string; direction: string }): any {
  if (!sortBy) return undefined;
  const map = TO_DB_MAPS[model];
  const dbField = map?.[sortBy.field] || sortBy.field;
  return { [dbField]: sortBy.direction === 'desc' ? 'desc' : 'asc' };
}

// ─── Adapter Factory ──────────────────────────────────────────────────────────

export function createNexusPrismaAdapter(prisma: any) {
  function getPrismaModel(model: string): any {
    const prismaModelName = MODEL_TO_PRISMA[model] || model;
    return (prisma as any)[prismaModelName];
  }

  return {
    id: 'nexus-prisma-adapter',
    create: async ({ model, data, select }: { model: string; data: Record<string, any>; select?: string[] }) => {
      const prismaModel = getPrismaModel(model);
      const dbData = mapFieldsToDb(model, data);

      // Remove undefined values
      for (const key of Object.keys(dbData)) {
        if (dbData[key] === undefined) delete dbData[key];
      }

      const result = await prismaModel.create({ data: dbData });
      return mapFieldsFromDb(model, result);
    },

    findOne: async ({ model, where, select }: { model: string; where: any[]; select?: string[] }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = mapWhereToDb(model, where);

      const result = await prismaModel.findFirst({ where: prismaWhere });
      return mapFieldsFromDb(model, result);
    },

    findMany: async ({ model, where, sortBy, limit, offset }: {
      model: string;
      where?: any[];
      sortBy?: { field: string; direction: string };
      limit?: number;
      offset?: number;
    }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = where ? mapWhereToDb(model, where) : {};
      const orderBy = mapSortByToDb(model, sortBy);

      const results = await prismaModel.findMany({
        where: prismaWhere,
        ...(orderBy ? { orderBy } : {}),
        ...(limit ? { take: limit } : {}),
        ...(offset ? { skip: offset } : {}),
      });

      return results.map((r: any) => mapFieldsFromDb(model, r));
    },

    update: async ({ model, where, update: updateData }: {
      model: string;
      where: any[];
      update: Record<string, any>;
    }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = mapWhereToDb(model, where);
      const dbData = mapFieldsToDb(model, updateData);

      // Remove undefined values
      for (const key of Object.keys(dbData)) {
        if (dbData[key] === undefined) delete dbData[key];
      }

      // Use updateMany + findFirst to handle composite where clauses
      const existing = await prismaModel.findFirst({ where: prismaWhere });
      if (!existing) return null;

      const result = await prismaModel.update({
        where: { id: existing.id },
        data: dbData,
      });
      return mapFieldsFromDb(model, result);
    },

    delete: async ({ model, where }: { model: string; where: any[] }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = mapWhereToDb(model, where);

      const existing = await prismaModel.findFirst({ where: prismaWhere });
      if (!existing) return;

      await prismaModel.delete({ where: { id: existing.id } });
    },

    deleteMany: async ({ model, where }: { model: string; where: any[] }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = mapWhereToDb(model, where);

      await prismaModel.deleteMany({ where: prismaWhere });
    },

    // Count helper (used by some plugins)
    count: async ({ model, where }: { model: string; where?: any[] }) => {
      const prismaModel = getPrismaModel(model);
      const prismaWhere = where ? mapWhereToDb(model, where) : {};
      return prismaModel.count({ where: prismaWhere });
    },
  };
}
