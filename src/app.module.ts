import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.schema';
import { CoreModule } from './core/core.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { PostsModule } from './modules/posts/posts.module';
import { CommentsModule } from './modules/comments/comments.module';
import { EventsModule } from './modules/events/events.module';
import { HangoutsModule } from './modules/hangouts/hangouts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadModule } from './modules/upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    CoreModule,
    HealthModule,
    AuthModule,
    CommunitiesModule,
    UsersModule,
    AdminModule,
    PostsModule,
    CommentsModule,
    EventsModule,
    HangoutsModule,
    ReportsModule,
    NotificationsModule,
    UploadModule,
  ],
})
export class AppModule {}
