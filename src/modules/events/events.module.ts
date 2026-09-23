import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { CommunityEventsController } from './community-events.controller';
import { AdminEventsController } from './admin-events.controller';

@Module({
  controllers: [EventsController, CommunityEventsController, AdminEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
