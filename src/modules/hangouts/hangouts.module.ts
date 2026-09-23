import { Module } from '@nestjs/common';
import { HangoutsService } from './hangouts.service';
import { HangoutsController } from './hangouts.controller';

@Module({
  controllers: [HangoutsController],
  providers: [HangoutsService],
  exports: [HangoutsService],
})
export class HangoutsModule {}
