import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CommunityPostsController } from './community-posts.controller';
import { PostsController } from './posts.controller';

@Module({
  controllers: [CommunityPostsController, PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
