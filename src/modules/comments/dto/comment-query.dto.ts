import { z } from 'zod';
import { paginationSchema } from '@/core/utils/zod-utils';

export const commentQuerySchema = paginationSchema;
export type CommentQueryDto = z.infer<typeof commentQuerySchema>;
