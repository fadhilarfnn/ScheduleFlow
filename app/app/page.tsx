'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, CalendarApi } from '@fullcalendar/core';
import { useAuth } from '@/lib/auth-context';
import { useEventStore } from '@/lib/event-store';
import { supabase, type CalendarEvent, type EventType } from '@/lib/supabase/client';
import { EventDetailDialog } from '@/components/event-detail-dialog';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type fcEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: {
    source_type: EventType;
    description: string | null;
    location: string | null;
  };
  classNames: string[];
};

export default function CalendarPage() {
  const { user } = useAuth();
  const { events, tasks, loading, fetchEvents, fetchTasks, updateEvent } = useEventStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calendarRef = useRef<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const getApi = (): CalendarApi | null => {
    try {
      return calendarRef.current?.getApi() ?? null;
    } catch {
      return null;
    }
  };

  const refreshData = useCallback(() => {
    if (!user) return;
    const cal = getApi();
    if (cal) {
      const start = cal.view.activeStart.toISOString();
      const end = cal.view.activeEnd.toISOString();
      fetchEvents(user.id, start, end);
    }
    fetchTasks(user.id);
  }, [user, fetchEvents, fetchTasks]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const calendarEvents: fcEvent[] = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      extendedProps: {
        source_type: e.source_type,
        description: e.description,
        location: e.location,
      },
      classNames: [`fc-event-${e.source_type.toLowerCase().replace('_', '')}`],
    })),
    ...tasks
      .filter((t) => t.scheduled_start_time && t.scheduled_end_time)
      .map((t) => ({
        id: `task-${t.id}`,
        title: `Task: ${t.title}`,
        start: t.scheduled_start_time!,
        end: t.scheduled_end_time!,
        extendedProps: {
          source_type: 'AI_SUGGESTED' as EventType,
          description: t.description,
          location: null,
        },
        classNames: ['fc-event-task'],
      })),
  ];

  const handleEventClick = (info: EventClickArg) => {
    const eventId = info.event.id.replace('task-', '');
    const event = events.find((e) => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setDialogOpen(true);
    }
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const eventId = info.event.id;
    if (eventId.startsWith('task-')) return;

    const newStart = info.event.start?.toISOString();
    const newEnd = info.event.end?.toISOString();
    if (!newStart || !newEnd) return;

    const { error } = await supabase
      .from('events')
      .update({ start_time: newStart, end_time: newEnd })
      .eq('id', eventId);

    if (error) {
      toast.error('Failed to update event time');
      info.revert();
      return;
    }

    updateEvent(eventId, { start_time: newStart, end_time: newEnd });
    toast.success('Event rescheduled');
  };

  const handleDatesSet = () => {
    refreshData();
  };

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your classes, activities, and scheduled tasks
          </p>
        </div>
        <Button
          onClick={() => {
            window.location.href = '/app/tasks';
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={calendarEvents}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={handleDatesSet}
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          nowIndicator
          editable
          selectable
          dayMaxEvents={3}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }}
          displayEventEnd
          eventDisplay="block"
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-[hsl(var(--event-manual))]" />
          <span className="text-muted-foreground">Manual Event</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-[hsl(var(--event-pdf))]" />
          <span className="text-muted-foreground">PDF Parsed Class</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-[hsl(var(--event-ai))]" />
          <span className="text-muted-foreground">AI Suggested</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-[hsl(var(--event-task))]" />
          <span className="text-muted-foreground">Scheduled Task</span>
        </div>
      </div>

      <EventDetailDialog
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={refreshData}
      />
    </div>
  );
}
