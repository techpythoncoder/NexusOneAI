export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_verified: boolean;
  avatar_url?: string;
  mfa_enabled?: boolean;
  current_organization_id?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_id: string;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
  user_email?: string;
  user_name?: string | null;
  joined_at?: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  status: "active" | "archived" | "completed";
  owner_id: string;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

export interface Task {
  id: string;
  project_id: string;
  organization_id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id?: string;
  due_date?: string;
  task_number: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  author_email: string;
  content: string;
  parent_id?: string;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  channel_type: "public" | "private" | "direct";
  description?: string | null;
  member_count: number | null;
  unread_count: number;
  created_at: string;
}

export interface ChannelMember {
  user_id: string;
  user_email: string;
  added_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_email: string;
  content: string;
  created_at: string;
}

export interface AIConversation {
  id: string;
  title: string;
  created_at: string;
  messages?: AIMessage[];
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface KnowledgePage {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  slug: string;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSummary {
  period_days: number;
  events: { type: string; count: number }[];
}

export interface AnalyticsEvent {
  id: string;
  event_type: string;
  resource_type: string | null;
  properties: Record<string, any>;
  occurred_at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}
