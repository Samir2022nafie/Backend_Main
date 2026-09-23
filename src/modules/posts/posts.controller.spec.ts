import { Test, TestingModule } from '@nestjs/testing';
import { CommunityPostsController } from './community-posts.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('Posts Controllers', () => {
  let communityPostsController: CommunityPostsController;
  let postsController: PostsController;

  const mockPostsService = {
    create: jest.fn().mockResolvedValue({ id: 'p1', title: 'Post 1' }),
    findAll: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], meta: { total: 1 } }),
    findOne: jest.fn().mockResolvedValue({ id: 'p1', title: 'Post 1' }),
    update: jest.fn().mockResolvedValue({ id: 'p1', title: 'Updated' }),
    softDelete: jest.fn().mockResolvedValue({ success: true }),
    toggleReaction: jest.fn().mockResolvedValue({ reacted: true, reactionCount: 1 }),
    toggleSave: jest.fn().mockResolvedValue({ saved: true }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityPostsController, PostsController],
      providers: [
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
      ],
    }).compile();

    communityPostsController = module.get<CommunityPostsController>(CommunityPostsController);
    postsController = module.get<PostsController>(PostsController);
  });

  it('should be defined', () => {
    expect(communityPostsController).toBeDefined();
    expect(postsController).toBeDefined();
  });

  describe('CommunityPostsController', () => {
    it('should create post', async () => {
      const res = await communityPostsController.create('outdoor', user, {
        title: 'New Post',
        content: 'Content',
      });
      expect(mockPostsService.create).toHaveBeenCalledWith('outdoor', 'user-1', {
        title: 'New Post',
        content: 'Content',
      });
      expect(res.id).toBe('p1');
    });

    it('should list posts', async () => {
      const res = await communityPostsController.findAll('outdoor', { page: 1, limit: 20 }, user);
      expect(mockPostsService.findAll).toHaveBeenCalledWith('outdoor', { page: 1, limit: 20 }, 'user-1');
      expect(res.data).toHaveLength(1);
    });
  });

  describe('PostsController', () => {
    it('should get single post', async () => {
      const res = await postsController.findOne('p1', user);
      expect(mockPostsService.findOne).toHaveBeenCalledWith('p1', 'user-1');
      expect(res.id).toBe('p1');
    });

    it('should update post', async () => {
      const res = await postsController.update('p1', user, { title: 'Updated' });
      expect(mockPostsService.update).toHaveBeenCalledWith('p1', 'user-1', { title: 'Updated' });
      expect(res.title).toBe('Updated');
    });

    it('should delete post', async () => {
      const res = await postsController.softDelete('p1', user);
      expect(mockPostsService.softDelete).toHaveBeenCalledWith('p1', 'user-1');
      expect(res.success).toBe(true);
    });

    it('should toggle reaction', async () => {
      const res = await postsController.toggleReaction('p1', user);
      expect(mockPostsService.toggleReaction).toHaveBeenCalledWith('p1', 'user-1');
      expect(res.reacted).toBe(true);
    });

    it('should toggle save', async () => {
      const res = await postsController.toggleSave('p1', user);
      expect(mockPostsService.toggleSave).toHaveBeenCalledWith('p1', 'user-1');
      expect(res.saved).toBe(true);
    });
  });
});
