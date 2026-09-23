import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  updatePostSchema,
  UpdatePostDto,
} from './dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Get(':id')
  async findOne(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.postsService.findOne(id, user?.id);
  }

  @Patch(':id')
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updatePostSchema)) dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, user.id, dto);
  }

  @Delete(':id')
  async softDelete(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.postsService.softDelete(id, user.id);
  }

  @Post(':id/react')
  async toggleReaction(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.postsService.toggleReaction(id, user.id);
  }

  @Post(':id/save')
  async toggleSave(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.postsService.toggleSave(id, user.id);
  }
}
