import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../common/constants';

export const Public = () => SetMetadata(METADATA_KEYS.IS_PUBLIC, true);
