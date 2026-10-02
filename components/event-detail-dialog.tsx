'use client';

import { useState, useEffect } from 'react';
import { supabase, type CalendarEvent } from '@/lib/supabase/client';
import { useEventStore } from '@/lib/event-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const sourceTypeLabels: Record<string, string> = {
  MANUAL: 'Manual',
  PDF_PARSED: 'PDF Parsed',
  AI_SUGGESTED: 'AI Suggested',
};

const sourceTypeColors: Record<string, string> = {
  MANUAL: 'bg-[hsl(var(--event-manual))] text-white',
  PDF_PARSED: 'bg-[hsl(var(--event-pdf))] text-white',
  AI_SUGGESTED: 'bg-[hsl(var(--event-ai))] text-white',
};

export function EventDetailDialog({
  event,
  open,
  onOpenChange,
  onUpdated,
}: {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { removeEvent, updateEvent } = useEventStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
    }
  }, [event]);

  if (!event) return null;

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from('events')
      .update({ title, description, location })
      .eq('id', event.id)
      .select()
      .single();

    if (error) {
      toast.error('Failed to update event');
      setSaving(false);
      return;
    }

    updateEvent(event.id, data as CalendarEvent);
    toast.success('Event updated');
    onUpdated();
    onOpenChange(false);
    setSaving(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) {
      toast.error('Failed to delete event');
      return;
    }
    removeEvent(event.id);
    toast.success('Event deleted');
    onUpdated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={sourceTypeColors[event.source_type]}>
              {sourceTypeLabels[event.source_type]}
            </Badge>
          </div>
          <DialogTitle className="mt-2">Event Details</DialogTitle>
          <DialogDescription>Edit or delete this calendar event</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {format(new Date(event.start_time), 'MMM d, h:mm a')} —{' '}
                {format(new Date(event.end_time), 'h:mm a')}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room 101, Building A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
