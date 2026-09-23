import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  createCommentSchema,
  CreateCommentDto,
  commentQuerySchema,
  CommentQueryDto,
} from './dto';

@Controller('posts/:id/comments')
export class PostCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  async create(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: CreateCommentDto,
  ) {
    return this.commentsService.create(id, user.id, dto);
  }

  @Public()
  @Get()
  async findAll(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query(new ZodValidationPipe(commentQuerySchema)) query: CommentQueryDto,
    @CurrentUser() user?: any,
  ) {
    return this.commentsService.findAll(id, query, user?.id);
  }
}
