import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PresignedUploadDto } from './dto';
import { resolveDirectImageUrl } from '@/core/utils/image-resolver.util';

@Injectable()
export class UploadService {
  async generatePresignedUrl(userId: string, dto: PresignedUploadDto) {
    const cleanFilename = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${randomUUID()}-${cleanFilename}`;
    const baseStorageUrl = process.env.STORAGE_PUBLIC_URL || 'https://storage.hobbyhub.local';
    const uploadUrl = `${baseStorageUrl}/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&uploader=${userId}`;
    const publicUrl = `${baseStorageUrl}/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key,
    };
  }

  async resolveImageUrl(url: string): Promise<{ resolvedUrl: string }> {
    const resolved = await resolveDirectImageUrl(url);
    return { resolvedUrl: resolved || url };
  }
}

