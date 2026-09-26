import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '@/modules/auth/auth.module';
import { LocationsModule } from '@/modules/locations/locations.module';

@Module({
  imports: [AuthModule, LocationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
