import { Test, TestingModule } from '@nestjs/testing';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadService],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate presigned upload url and unique storage key', async () => {
    const result = await service.generatePresignedUrl('user-123', {
      filename: 'profile picture.png',
      contentType: 'image/png',
    });

    expect(result.key).toMatch(/^uploads\/[a-f0-9-]+-profile_picture\.png$/);
    expect(result.uploadUrl).toContain(result.key);
    expect(result.uploadUrl).toContain('uploader=user-123');
    expect(result.publicUrl).toContain(result.key);
  });
});
