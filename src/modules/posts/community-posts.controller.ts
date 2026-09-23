import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import {
  createPostSchema,
  CreatePostDto,
  postQuerySchema,
  PostQueryDto,
} from './dto';

@Controller('communities/:slug/posts')
export class CommunityPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createPostSchema)) dto: CreatePostDto,
  ) {
    return this.postsService.create(slug, user.id, dto);
  }

  @Public()
  @Get()
  async findAll(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(postQuerySchema)) query: PostQueryDto,
    @CurrentUser() user?: any,
  ) {
    return this.postsService.findAll(slug, query, user?.id);
  }
}
