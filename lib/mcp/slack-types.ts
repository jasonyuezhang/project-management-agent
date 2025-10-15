// Slack MCP Types
export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string;
  isBot: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isPrimaryOwner: boolean;
  isRestricted: boolean;
  isUltraRestricted: boolean;
  profile: {
    title: string;
    phone: string;
    skype: string;
    realName: string;
    realNameNormalized: string;
    displayName: string;
    displayNameNormalized: string;
    statusText: string;
    statusEmoji: string;
    statusExpiration: number;
    avatarHash: string;
    email: string;
    image24: string;
    image32: string;
    image48: string;
    image72: string;
    image192: string;
    image512: string;
    statusTextCanonical: string;
    team: string;
  };
  tz: string;
  tzLabel: string;
  tzOffset: number;
  updated: number;
  isDeleted: boolean;
  color: string;
  has2fa: boolean;
  locale: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isGroup: boolean;
  isIm: boolean;
  isMember: boolean;
  isMpim: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isGeneral: boolean;
  isShared: boolean;
  isOrgShared: boolean;
  isPendingExtShared: boolean;
  isExtShared: boolean;
  isStarred: boolean;
  isMuted: boolean;
  isOpen: boolean;
  created: number;
  creator: string;
  isReadOnly: boolean;
  isThreadOnly: boolean;
  isNonThreadable: boolean;
  isShared: boolean;
  isOrgShared: boolean;
  isPendingExtShared: boolean;
  isExtShared: boolean;
  isStarred: boolean;
  isMuted: boolean;
  isOpen: boolean;
  created: number;
  creator: string;
  isReadOnly: boolean;
  isThreadOnly: boolean;
  isNonThreadable: boolean;
  topic: {
    value: string;
    creator: string;
    lastSet: number;
  };
  purpose: {
    value: string;
    creator: string;
    lastSet: number;
  };
  numMembers: number;
  previousNames: string[];
  priority: number;
}

export interface SlackMessage {
  text: string;
  channel: string;
  user?: string;
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  linkNames?: boolean;
  parse?: 'full' | 'none';
  asUser?: boolean;
  mrkdwn?: boolean;
  mrkdwnIn?: string[];
}

export interface SlackAttachment {
  color?: string;
  fallback: string;
  title?: string;
  titleLink?: string;
  text?: string;
  fields?: SlackField[];
  actions?: SlackAction[];
  imageUrl?: string;
  thumbUrl?: string;
  footer?: string;
  footerIcon?: string;
  ts?: number;
  mrkdwnIn?: string[];
}

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

export interface SlackAction {
  type: 'button' | 'select';
  text: string;
  value: string;
  url?: string;
  style?: 'default' | 'primary' | 'danger';
  confirm?: SlackConfirmation;
}

export interface SlackConfirmation {
  title: string;
  text: string;
  okText: string;
  dismissText: string;
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'image' | 'actions' | 'context' | 'input' | 'file' | 'header';
  blockId?: string;
  text?: SlackText;
  fields?: SlackText[];
  accessory?: SlackElement;
  elements?: SlackElement[];
  imageUrl?: string;
  altText?: string;
  title?: SlackText;
  submit?: SlackText;
  placeholder?: SlackText;
  initialValue?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  dispatchAction?: boolean;
  dispatchActionConfig?: {
    triggerActionsOn: string[];
  };
  element?: SlackElement;
  label?: SlackText;
  optional?: boolean;
  hint?: SlackText;
  confirm?: SlackConfirmation;
  options?: SlackOption[];
  optionGroups?: SlackOptionGroup[];
  initialOptions?: SlackOption[];
  maxSelectedItems?: number;
  focusOnLoad?: boolean;
  placeholder?: SlackText;
  actionId?: string;
  url?: string;
  value?: string;
  style?: 'default' | 'primary' | 'danger';
  accessibilityLabel?: string;
  fallback?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageBytes?: number;
}

export interface SlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
  verbatim?: boolean;
}

export interface SlackElement {
  type: 'button' | 'checkboxes' | 'datepicker' | 'image' | 'multi_static_select' | 'multi_external_select' | 'multi_users_select' | 'multi_conversations_select' | 'multi_channels_select' | 'overflow' | 'plain_text_input' | 'radio_buttons' | 'select' | 'external_select' | 'users_select' | 'conversations_select' | 'channels_select' | 'timepicker';
  actionId: string;
  text?: SlackText;
  value?: string;
  url?: string;
  style?: 'default' | 'primary' | 'danger';
  confirm?: SlackConfirmation;
  placeholder?: SlackText;
  initialValue?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  dispatchAction?: boolean;
  dispatchActionConfig?: {
    triggerActionsOn: string[];
  };
  element?: SlackElement;
  label?: SlackText;
  optional?: boolean;
  hint?: SlackText;
  options?: SlackOption[];
  optionGroups?: SlackOptionGroup[];
  initialOptions?: SlackOption[];
  maxSelectedItems?: number;
  focusOnLoad?: boolean;
  placeholder?: SlackText;
  accessibilityLabel?: string;
  fallback?: string;
  imageUrl?: string;
  altText?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageBytes?: number;
}

export interface SlackOption {
  text: SlackText;
  value: string;
  description?: SlackText;
  url?: string;
}

export interface SlackOptionGroup {
  label: SlackText;
  options: SlackOption[];
}

export interface SlackReply {
  text: string;
  user: string;
  channel: string;
  timestamp: string;
  threadTs?: string;
  replyTo?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
}

export interface InteractiveMessage {
  channel: string;
  text: string;
  blocks: SlackBlock[];
  attachments?: SlackAttachment[];
  threadTs?: string;
  replyBroadcast?: boolean;
}

export interface SlackMCPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Slack-specific types for execution plans
export interface SlackExecutionPlanMessage {
  channel: string;
  text: string;
  blocks: SlackBlock[];
  attachments: SlackAttachment[];
  threadTs?: string;
}

export interface SlackTeamSummaryMessage {
  channel: string;
  text: string;
  blocks: SlackBlock[];
  attachments: SlackAttachment[];
}

export interface SlackUserGroup {
  id: string;
  name: string;
  handle: string;
  description: string;
  isExternal: boolean;
  isUsergroup: boolean;
  isSubteam: boolean;
  teamId: string;
  users: string[];
  userCount: number;
  createdBy: string;
  updatedBy: string;
  dateCreate: number;
  dateUpdate: number;
  dateDelete: number;
  autoType: string;
  createdByDeleted: boolean;
  deletedBy: string;
  prefs: {
    channels: string[];
    groups: string[];
  };
  priority: number;
}

// Message parsing types
export interface PlanModification {
  ticketId: string;
  action: 'status_change' | 'reassign' | 'comment';
  value: string;
  userId: string;
  timestamp: Date;
  originalMessage: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  modifications: PlanModification[];
}