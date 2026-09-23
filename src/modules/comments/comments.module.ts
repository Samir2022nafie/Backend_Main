import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PostCommentsController } from './post-comments.controller';
import { CommentsController } from './comments.controller';

@Module({
  controllers: [PostCommentsController, CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
