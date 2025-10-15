// Linear MCP Types
export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  progress: number;
  targetDate?: string;
  startDate?: string;
  completedAt?: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: LinearIssueState;
  priority: number;
  estimate?: number;
  assignee?: LinearUser;
  creator: LinearUser;
  team: LinearTeam;
  project?: LinearProject;
  labels: LinearLabel[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  dueDate?: string;
  url: string;
}

export interface LinearIssueState {
  id: string;
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  color: string;
  position: number;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: LinearUser;
  issue: LinearIssue;
}

export interface LinearCustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multiSelect';
  value: string | number | boolean | string[];
  options?: string[];
}

export interface LinearCustomFieldValue {
  id: string;
  value: string | number | boolean | string[];
  customField: LinearCustomField;
}

export interface ExecutionPlanMetadata {
  planId: string;
  lastPlanDate: string;
  userId: string;
  userName: string;
  ticketCount: number;
  completedCount: number;
  inProgressCount: number;
  openCount: number;
}

// MCP Response Types
export interface LinearMCPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Plan Generation Types
export interface ExecutionPlan {
  userId: string;
  userName: string;
  tickets: {
    finished: LinearIssue[];
    inProgress: LinearIssue[];
    open: LinearIssue[];
  };
  summary: string;
  generatedAt: Date;
  planId: string;
}

export interface TeamSummary {
  teamId: string;
  teamName: string;
  totalTickets: number;
  completedTickets: number;
  inProgressTickets: number;
  openTickets: number;
  completionRate: number;
  plans: ExecutionPlan[];
  generatedAt: Date;
}

// Filter Types
export type TicketStatus = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
export type TicketPriority = 0 | 1 | 2 | 3 | 4; // 0 = No priority, 4 = Urgent

export interface TicketFilter extends Record<string, unknown> {
  status?: TicketStatus[];
  assigneeId?: string;
  teamId?: string;
  projectId?: string;
  priority?: TicketPriority[];
  labels?: string[];
  createdAfter?: string;
  createdBefore?: string;
  dueAfter?: string;
  dueBefore?: string;
}

// Re-export Slack types for convenience
export * from './slack-types.js';