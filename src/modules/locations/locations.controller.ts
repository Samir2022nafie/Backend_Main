import {
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Public } from '@/core/decorators/public.decorator';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { upsertLocationSchema, UpsertLocationDto } from './dto/upsert-location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  /**
   * GET /locations/explore — Fetches all geo-located items for the Snapchat-style explore map.
   */
  @Public()
  @Get('explore')
  async getExplore(@CurrentUser() user?: any) {
    return this.locationsService.getExploreMapItems(user?.id);
  }

  /**
   * GET /locations — Search saved locations.
   */
  @Public()
  @Get()
  async findAll(@Query('q') q?: string, @Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 20;
    return this.locationsService.findAll(q, isNaN(take) ? 20 : take);
  }

  /**
   * POST /locations — Upsert a location by name and coordinates.
   */
  @Post()
  async upsert(
    @Body(new ZodValidationPipe(upsertLocationSchema)) dto: UpsertLocationDto,
  ) {
    return this.locationsService.upsert(dto);
  }
}
