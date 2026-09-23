export const APP_CONSTANTS = {
  API_PREFIX: 'api/v1',
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_USER_AGE: 13,
  DEFAULT_TRUST_SCORE: 50,
} as const;

export const METADATA_KEYS = {
  IS_PUBLIC: 'isPublic',
  ROLES: 'roles',
  POLICIES: 'policies',
} as const;
