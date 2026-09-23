import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { CommunityModerationController } from './community-moderation.controller';
import { ReportsService } from './reports.service';

describe('Reports & Moderation Controllers', () => {
  let reportsController: ReportsController;
  let moderationController: CommunityModerationController;

  const mockReportsService = {
    createReport: jest.fn().mockResolvedValue({ id: 'r1', reason: 'Spam' }),
    listReports: jest.fn().mockResolvedValue({ data: [{ id: 'r1' }], meta: { total: 1 } }),
    updateReportStatus: jest.fn().mockResolvedValue({ id: 'r1', status: 'resolved' }),
    takeAction: jest.fn().mockResolvedValue({
      moderationAction: { id: 'ma1', action_type: 'content_removed' },
      report: { id: 'r1', status: 'resolved' },
    }),
    listCommunityReports: jest.fn().mockResolvedValue({ data: [{ id: 'r1' }], meta: { total: 1 } }),
    listCommunityModerationActions: jest
      .fn()
      .mockResolvedValue({ data: [{ id: 'ma1' }], meta: { total: 1 } }),
    listCommunityBannedUsers: jest.fn().mockResolvedValue({ data: [{ userId: 'u1' }], total: 1 }),
  };

  const user = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController, CommunityModerationController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    }).compile();

    reportsController = module.get<ReportsController>(ReportsController);
    moderationController = module.get<CommunityModerationController>(CommunityModerationController);
  });

  it('should be defined', () => {
    expect(reportsController).toBeDefined();
    expect(moderationController).toBeDefined();
  });

  describe('ReportsController', () => {
    it('should create report', async () => {
      const res = await reportsController.create(user, {
        reason: 'Spam',
        reportedPostId: '11111111-1111-1111-1111-111111111111',
      });
      expect(mockReportsService.createReport).toHaveBeenCalledWith('user-1', {
        reason: 'Spam',
        reportedPostId: '11111111-1111-1111-1111-111111111111',
      });
      expect(res.id).toBe('r1');
    });

    it('should list reports', async () => {
      const res = await reportsController.list(user, { page: 1, limit: 10 });
      expect(mockReportsService.listReports).toHaveBeenCalledWith('user-1', { page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
    });

    it('should update report status', async () => {
      const res = await reportsController.updateStatus('r1', user, { status: 'resolved' });
      expect(mockReportsService.updateReportStatus).toHaveBeenCalledWith('r1', 'user-1', {
        status: 'resolved',
      });
      expect(res.status).toBe('resolved');
    });

    it('should take action on report', async () => {
      const res = await reportsController.takeAction('r1', user, {
        actionType: 'content_removed',
        notes: 'Hate speech',
      });
      expect(mockReportsService.takeAction).toHaveBeenCalledWith('r1', 'user-1', {
        actionType: 'content_removed',
        notes: 'Hate speech',
      });
      expect(res.moderationAction.action_type).toBe('content_removed');
    });
  });

  describe('CommunityModerationController', () => {
    it('should list community reports', async () => {
      const res = await moderationController.listCommunityReports('art-hub', user, {
        page: 1,
        limit: 10,
      });
      expect(mockReportsService.listCommunityReports).toHaveBeenCalledWith('art-hub', 'user-1', {
        page: 1,
        limit: 10,
      });
      expect(res.data).toHaveLength(1);
    });

    it('should list community moderation actions', async () => {
      const res = await moderationController.listCommunityModerationActions('art-hub', user, {
        page: 1,
        limit: 10,
      });
      expect(mockReportsService.listCommunityModerationActions).toHaveBeenCalledWith(
        'art-hub',
        'user-1',
        { page: 1, limit: 10 },
      );
      expect(res.data).toHaveLength(1);
    });

    it('should list community banned users', async () => {
      const res = await moderationController.listCommunityBannedUsers('art-hub', user);
      expect(mockReportsService.listCommunityBannedUsers).toHaveBeenCalledWith('art-hub', 'user-1');
      expect(res.total).toBe(1);
    });
  });
});
