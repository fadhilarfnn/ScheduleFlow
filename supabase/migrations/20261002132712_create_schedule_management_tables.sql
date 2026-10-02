/*
# Create Schedule Management Tables

## Overview
Creates the full database schema for a Personal Daily Activity & Schedule Management app.
Includes user profiles, calendar events, tasks, and WhatsApp notification logs.

## New Tables

1. **profiles** — User profile data linked to auth.users
   - id (uuid, PK, references auth.users)
   - full_name (text)
   - timezone (text, default 'Asia/Jakarta')
   - wa_number_primary (text, not null)
   - wa_number_secondary (text, nullable)
   - is_wa_secondary_active (boolean, default false)
   - notification_lead_times_minutes (int[], default '{30, 10}')
   - max_notifications_per_event (int, default 2)
   - is_notifications_enabled (boolean, default true)
   - created_at, updated_at (timestamptz)

2. **events** — Calendar events (classes, personal activities, AI-suggested tasks)
   - id (uuid, PK)
   - user_id (uuid, FK to profiles, default auth.uid())
   - title (text, not null)
   - description (text)
   - location (text)
   - source_type (text, CHECK in MANUAL/PDF_PARSED/AI_SUGGESTED, default MANUAL)
   - start_time (timestamptz, not null)
   - end_time (timestamptz, not null)
   - gcal_event_id (text)
   - is_recurring (boolean, default false)
   - recurrence_day_of_week (int)
   - recurrence_until (date)
   - created_at, updated_at (timestamptz)

3. **tasks** — Assignments/tasks with AI scheduling support
   - id (uuid, PK)
   - user_id (uuid, FK to profiles, default auth.uid())
   - title (text, not null)
   - description (text)
   - estimated_duration_minutes (int, not null, default 60)
   - deadline (timestamptz, not null)
   - priority (text, CHECK in LOW/MEDIUM/HIGH, default MEDIUM)
   - status (text, CHECK in PENDING/IN_PROGRESS/COMPLETED, default PENDING)
   - scheduled_start_time (timestamptz)
   - scheduled_end_time (timestamptz)
   - gcal_event_id (text)
   - created_at, updated_at (timestamptz)

4. **whatsapp_notification_logs** — Tracks pending/sent/failed WhatsApp messages
   - id (uuid, PK)
   - user_id (uuid, FK to profiles, default auth.uid())
   - event_id (uuid, FK to events, nullable, ON DELETE CASCADE)
   - task_id (uuid, FK to tasks, nullable, ON DELETE CASCADE)
   - phone_number_sent (text, not null)
   - message_content (text, not null)
   - scheduled_for (timestamptz, not null)
   - sent_at (timestamptz)
   - status (text, CHECK in PENDING/SENT/FAILED, default PENDING)
   - error_message (text)
   - created_at (timestamptz)

## Security
- RLS enabled on ALL tables
- Owner-scoped CRUD policies (4 per table) scoped TO authenticated
- user_id columns default to auth.uid() so inserts that omit user_id succeed
- whatsapp_notification_logs scoped by user_id ownership

## Indexes
- events: user_id, start_time
- tasks: user_id, deadline, status
- whatsapp_notification_logs: user_id, status, scheduled_for
*/

-- Enable uuid extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- profiles table
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    timezone TEXT DEFAULT 'Asia/Jakarta',
    wa_number_primary TEXT NOT NULL,
    wa_number_secondary TEXT,
    is_wa_secondary_active BOOLEAN DEFAULT false,
    notification_lead_times_minutes INT[] DEFAULT '{30, 10}',
    max_notifications_per_event INT DEFAULT 2,
    is_notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
    TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
    TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
    TO authenticated USING (auth.uid() = id);

-- ============================================
-- events table
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    source_type TEXT CHECK (source_type IN ('MANUAL', 'PDF_PARSED', 'AI_SUGGESTED')) DEFAULT 'MANUAL',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    gcal_event_id TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_day_of_week INT,
    recurrence_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_events" ON events;
CREATE POLICY "select_own_events" ON events FOR SELECT
    TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_events" ON events;
CREATE POLICY "insert_own_events" ON events FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_events" ON events;
CREATE POLICY "update_own_events" ON events FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_events" ON events;
CREATE POLICY "delete_own_events" ON events FOR DELETE
    TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);

-- ============================================
-- tasks table
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    estimated_duration_minutes INT NOT NULL DEFAULT 60,
    deadline TIMESTAMPTZ NOT NULL,
    priority TEXT CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
    status TEXT CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')) DEFAULT 'PENDING',
    scheduled_start_time TIMESTAMPTZ,
    scheduled_end_time TIMESTAMPTZ,
    gcal_event_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tasks" ON tasks;
CREATE POLICY "select_own_tasks" ON tasks FOR SELECT
    TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_tasks" ON tasks;
CREATE POLICY "insert_own_tasks" ON tasks FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_tasks" ON tasks;
CREATE POLICY "update_own_tasks" ON tasks FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_tasks" ON tasks;
CREATE POLICY "delete_own_tasks" ON tasks FOR DELETE
    TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ============================================
-- whatsapp_notification_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    phone_number_sent TEXT NOT NULL,
    message_content TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('PENDING', 'SENT', 'FAILED')) DEFAULT 'PENDING',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wa_logs" ON whatsapp_notification_logs;
CREATE POLICY "select_own_wa_logs" ON whatsapp_notification_logs FOR SELECT
    TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wa_logs" ON whatsapp_notification_logs;
CREATE POLICY "insert_own_wa_logs" ON whatsapp_notification_logs FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wa_logs" ON whatsapp_notification_logs;
CREATE POLICY "update_own_wa_logs" ON whatsapp_notification_logs FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wa_logs" ON whatsapp_notification_logs;
CREATE POLICY "delete_own_wa_logs" ON whatsapp_notification_logs FOR DELETE
    TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wa_logs_user_id ON whatsapp_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_logs_status ON whatsapp_notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_wa_logs_scheduled_for ON whatsapp_notification_logs(scheduled_for);

-- ============================================
-- updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();