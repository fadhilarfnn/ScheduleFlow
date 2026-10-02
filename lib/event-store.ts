'use client';

import { create } from 'zustand';
import { supabase, type CalendarEvent, type Task } from '@/lib/supabase/client';

type EventStore = {
  events: CalendarEvent[];
  tasks: Task[];
  loading: boolean;
  fetchEvents: (userId: string, start: string, end: string) => Promise<void>;
  fetchTasks: (userId: string) => Promise<void>;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  removeEvent: (id: string) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
};

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  tasks: [],
  loading: false,

  fetchEvents: async (userId, start, end) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', start)
      .lte('end_time', end)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      set({ loading: false });
      return;
    }
    set({ events: data as CalendarEvent[], loading: false });
  },

  fetchTasks: async (userId) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('deadline', { ascending: true });

    if (error) {
      console.error('Error fetching tasks:', error);
      return;
    }
    set({ tasks: data as Task[] });
  },

  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  updateEvent: (id, updates) =>
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  removeEvent: (id) =>
    set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));
