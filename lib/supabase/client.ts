'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export type Profile = {
  id: string;
  full_name: string | null;
  timezone: string;
  wa_number_primary: string;
  wa_number_secondary: string | null;
  is_wa_secondary_active: boolean;
  notification_lead_times_minutes: number[];
  max_notifications_per_event: number;
  is_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type EventType = 'MANUAL' | 'PDF_PARSED' | 'AI_SUGGESTED';

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  source_type: EventType;
  start_time: string;
  end_time: string;
  gcal_event_id: string | null;
  is_recurring: boolean;
  recurrence_day_of_week: number | null;
  recurrence_until: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  estimated_duration_minutes: number;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  gcal_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationLog = {
  id: string;
  user_id: string;
  event_id: string | null;
  task_id: string | null;
  phone_number_sent: string;
  message_content: string;
  scheduled_for: string;
  sent_at: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED';
  error_message: string | null;
  created_at: string;
};
