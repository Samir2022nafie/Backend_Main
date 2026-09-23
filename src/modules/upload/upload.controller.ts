import {
  Controller,
  Post,
  Body,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/core/pipes/zod-validation.pipe';
import { presignedUploadSchema, PresignedUploadDto } from './dto';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned')
  async getPresignedUrl(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(presignedUploadSchema)) dto: PresignedUploadDto,
  ) {
    return this.uploadService.generatePresignedUrl(user.id, dto);
  }

  @Post('resolve-url')
  async resolveUrl(@Body('url') url: string) {
    return this.uploadService.resolveImageUrl(url);
  }
}

