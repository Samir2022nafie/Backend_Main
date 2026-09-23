import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import { updateUserSchema, UpdateUserDto } from './dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/communities')
  async findManagedCommunities(@CurrentUser() user: any) {
    return this.usersService.findManagedCommunities(user.id);
  }

  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Delete('me')
  async softDelete(@CurrentUser() user: any) {
    return this.usersService.softDelete(user.id);
  }

  @Public()
  @Get(':id')
  async getPublicProfile(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.usersService.getPublicProfile(id, user?.id);
  }

  @Public()
  @Get(':id/posts')
  async getUserPosts(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.usersService.getUserPosts(id, user?.id);
  }

  @Post(':id/follow')
  async followUser(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.followUser(id, user.id);
  }

  @Delete(':id/follow')
  async unfollowUser(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.unfollowUser(id, user.id);
  }

  @Post(':id/block')
  async blockUser(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.blockUser(id, user.id);
  }

  @Delete(':id/block')
  async unblockUser(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.unblockUser(id, user.id);
  }

  @Public()
  @Get(':id/trust-score')
  async getTrustScore(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user?: any,
  ) {
    return this.usersService.getTrustScore(id, user?.id);
  }
}
