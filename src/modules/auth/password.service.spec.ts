import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash a password and verify it correctly', async () => {
    const raw = 'SecretPassword123!';
    const hash = await service.hash(raw);

    expect(hash).toBeDefined();
    expect(hash).not.toEqual(raw);

    const isMatch = await service.compare(raw, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await service.compare('WrongPassword', hash);
    expect(isWrongMatch).toBe(false);
  });
});
