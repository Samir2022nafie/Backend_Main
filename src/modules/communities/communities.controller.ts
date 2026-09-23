import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { Public } from '@/core/decorators/public.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { uuidSchema } from '@/core/utils/zod-utils';
import {
  createCommunitySchema,
  CreateCommunityDto,
  updateCommunitySchema,
  UpdateCommunityDto,
  communityQuerySchema,
  CommunityQueryDto,
  listMembersQuerySchema,
  ListMembersQueryDto,
  updateMemberRoleSchema,
  UpdateMemberRoleDto,
} from './dto';

@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createCommunitySchema)) dto: CreateCommunityDto,
  ) {
    return this.communitiesService.create(user.id, dto);
  }

  @Public()
  @Get()
  async findAll(
    @Query(new ZodValidationPipe(communityQuerySchema)) query: CommunityQueryDto,
    @CurrentUser() user?: any,
  ) {
    return this.communitiesService.findAll(query, user?.id);
  }

  @Public()
  @Get(':slug')
  async findBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: any,
  ) {
    return this.communitiesService.findBySlug(slug, user?.id);
  }

  @Patch(':slug')
  async update(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateCommunitySchema)) dto: UpdateCommunityDto,
  ) {
    return this.communitiesService.update(slug, user.id, dto);
  }

  @Delete(':slug')
  async softDelete(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.communitiesService.softDelete(slug, user.id);
  }

  @Post(':slug/join')
  async join(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.communitiesService.join(slug, user.id);
  }

  @Post(':slug/leave')
  async leave(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
  ) {
    return this.communitiesService.leave(slug, user.id);
  }

  @Get(':slug/members')
  async listMembers(
    @Param('slug') slug: string,
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQueryDto,
  ) {
    return this.communitiesService.listMembers(slug, user.id, query);
  }

  @Patch(':slug/members/:userId')
  async updateMemberRole(
    @Param('slug') slug: string,
    @Param('userId', new ZodValidationPipe(uuidSchema)) targetUserId: string,
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) dto: UpdateMemberRoleDto,
  ) {
    return this.communitiesService.updateMemberRole(slug, user.id, targetUserId, dto);
  }

  @Delete(':slug/members/:userId/kick')
  async kickMember(
    @Param('slug') slug: string,
    @Param('userId', new ZodValidationPipe(uuidSchema)) targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.communitiesService.kickMember(slug, user.id, targetUserId);
  }
}
