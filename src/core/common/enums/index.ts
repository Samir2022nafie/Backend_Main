export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ACCOUNT_EXISTS_NOT_LINKED = 'ACCOUNT_EXISTS_NOT_LINKED',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum CommunityRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member',
}

export enum VisibilityScope {
  PUBLIC = 'public',
  COMMUNITY = 'community',
  SUBCOMMUNITY = 'subcommunity',
}

export enum EventApprovalStatus {
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum HangoutJoinType {
  OPEN = 'open',
  REQUEST_BASED = 'request_based',
}

export enum HangoutRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ModerationActionType {
  WARN = 'warn',
  SUSPEND = 'suspend',
  BAN = 'ban',
  UNBAN = 'unban',
  CONTENT_REMOVED = 'content_removed',
  CONTENT_RESTORED = 'content_restored',
  PROMOTE_MODERATOR = 'promote_moderator',
  DEMOTE_MODERATOR = 'demote_moderator',
}

export enum NotificationType {
  POST_REACTION = 'post_reaction',
  COMMENT_REPLY = 'comment_reply',
  EVENT_APPROVED = 'event_approved',
  EVENT_REMINDER = 'event_reminder',
  HANGOUT_REQUEST = 'hangout_request',
  HANGOUT_APPROVED = 'hangout_approved',
  REPORT_RESOLVED = 'report_resolved',
  MODERATION_ACTION = 'moderation_action',
  FOLLOW = 'follow',
  MENTION = 'mention',
}
