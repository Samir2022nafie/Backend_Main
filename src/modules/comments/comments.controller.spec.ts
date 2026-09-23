import { Test, TestingModule } from '@nestjs/testing';
import { PostCommentsController } from './post-comments.controller';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

describe('Comments Controllers', () => {
  let postCommentsController: PostCommentsController;
  let commentsController: CommentsController;

  const mockCommentsService = {
    create: jest.fn().mockResolvedValue({ id: 'c1', content: 'Comment 1' }),
    findAll: jest.fn().mockResolvedValue({ data: [{ id: 'c1' }], meta: { total: 1 } }),
    findOne: jest.fn().mockResolvedValue({ id: 'c1', content: 'Comment 1' }),
    update: jest.fn().mockResolvedValue({ id: 'c1', content: 'Updated' }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
    toggleReaction: jest.fn().mockResolvedValue({ reacted: true, reactionCount: 1 }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostCommentsController, CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: mockCommentsService,
        },
      ],
    }).compile();

    postCommentsController = module.get<PostCommentsController>(PostCommentsController);
    commentsController = module.get<CommentsController>(CommentsController);
  });

  it('should be defined', () => {
    expect(postCommentsController).toBeDefined();
    expect(commentsController).toBeDefined();
  });

  describe('PostCommentsController', () => {
    it('should create comment', async () => {
      const res = await postCommentsController.create('post-1', user, {
        content: 'New Comment',
      });
      expect(mockCommentsService.create).toHaveBeenCalledWith('post-1', 'user-1', {
        content: 'New Comment',
      });
      expect(res.id).toBe('c1');
    });

    it('should list comments for post', async () => {
      const res = await postCommentsController.findAll('post-1', { page: 1, limit: 20 }, user);
      expect(mockCommentsService.findAll).toHaveBeenCalledWith('post-1', { page: 1, limit: 20 }, 'user-1');
      expect(res.data).toHaveLength(1);
    });
  });

  describe('CommentsController', () => {
    it('should get single comment', async () => {
      const res = await commentsController.findOne('c1', user);
      expect(mockCommentsService.findOne).toHaveBeenCalledWith('c1', 'user-1');
      expect(res.id).toBe('c1');
    });

    it('should update comment', async () => {
      const res = await commentsController.update('c1', user, { content: 'Updated' });
      expect(mockCommentsService.update).toHaveBeenCalledWith('c1', 'user-1', { content: 'Updated' });
      expect(res.content).toBe('Updated');
    });

    it('should soft delete comment', async () => {
      const res = await commentsController.softDelete('c1', user);
      expect(mockCommentsService.softDelete).toHaveBeenCalledWith('c1', 'user-1');
      expect(res.success).toBe(true);
    });

    it('should toggle comment reaction', async () => {
      const res = await commentsController.toggleReaction('c1', user);
      expect(mockCommentsService.toggleReaction).toHaveBeenCalledWith('c1', 'user-1');
      expect(res.reacted).toBe(true);
    });
  });
});
