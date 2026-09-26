import { Module } from '@nestjs/common';
import { HangoutsService } from './hangouts.service';
import { HangoutsController } from './hangouts.controller';
import { LocationsModule } from '@/modules/locations/locations.module';

@Module({
  imports: [LocationsModule],
  controllers: [HangoutsController],
  providers: [HangoutsService],
  exports: [HangoutsService],
})
export class HangoutsModule {}
