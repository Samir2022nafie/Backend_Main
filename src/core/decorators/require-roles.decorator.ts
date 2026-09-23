import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../common/constants';
import { CommunityRole } from '../common/enums';

export const RequireCommunityRole = (...roles: CommunityRole[]) =>
  SetMetadata(METADATA_KEYS.ROLES, roles);
