import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../common/constants';
import { AppAbility } from '../security/casl-ability.factory';

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(METADATA_KEYS.POLICIES, handlers);
