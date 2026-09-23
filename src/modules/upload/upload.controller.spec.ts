import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

describe('UploadController', () => {
  let controller: UploadController;

  const mockUploadService = {
    generatePresignedUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://storage/uploads/1-avatar.jpg',
      publicUrl: 'https://storage/uploads/1-avatar.jpg',
      key: 'uploads/1-avatar.jpg',
    }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: mockUploadService,
        },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should generate presigned url', async () => {
    const dto = { filename: 'avatar.jpg', contentType: 'image/jpeg' as const };
    const res = await controller.getPresignedUrl(user, dto);

    expect(mockUploadService.generatePresignedUrl).toHaveBeenCalledWith('user-1', dto);
    expect(res.key).toBe('uploads/1-avatar.jpg');
  });
});
