import { Controller, Get, Param } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('communities/:slug')
  async getCommunityOverview(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.getCommunityOverview(slug, user.id);
  }

  @Get('communities/:slug/stats')
  async getCommunityStats(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.adminService.getCommunityStats(slug, user.id);
  }
}
