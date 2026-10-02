'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEventStore } from '@/lib/event-store';
import { supabase, type Task, type TaskPriority } from '@/lib/supabase/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2, Check, X, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function toLocalDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

type AISuggestion = {
  scheduled_start_time: string;
  scheduled_end_time: string;
  reasoning: string;
};

export function TaskDialog({
  task,
  open,
  onOpenChange,
  onUpdated,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const { events, addTask, updateTask } = useEventStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDuration(task.estimated_duration_minutes);
      setDeadline(toLocalDateTimeInput(new Date(task.deadline)));
      setPriority(task.priority);
      setAiSuggestion(
        task.scheduled_start_time && task.scheduled_end_time
          ? {
              scheduled_start_time: task.scheduled_start_time,
              scheduled_end_time: task.scheduled_end_time,
              reasoning: 'Previously scheduled',
            }
          : null
      );
    } else {
      setTitle('');
      setDescription('');
      setDuration(60);
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 3);
      defaultDeadline.setHours(23, 59);
      setDeadline(toLocalDateTimeInput(defaultDeadline));
      setPriority('MEDIUM');
      setAiSuggestion(null);
    }
  }, [task, open]);

  const handleSave = async () => {
    if (!user || !title.trim() || !deadline) return;
    setSaving(true);

    try {
      if (task) {
        const { data, error } = await supabase
          .from('tasks')
          .update({
            title,
            description,
            estimated_duration_minutes: duration,
            deadline: fromLocalDateTimeInput(deadline),
            priority,
            scheduled_start_time: aiSuggestion?.scheduled_start_time || null,
            scheduled_end_time: aiSuggestion?.scheduled_end_time || null,
          })
          .eq('id', task.id)
          .select()
          .single();

        if (error) throw error;
        updateTask(task.id, data as Task);
        toast.success('Task updated');
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            title,
            description,
            estimated_duration_minutes: duration,
            deadline: fromLocalDateTimeInput(deadline),
            priority,
            scheduled_start_time: aiSuggestion?.scheduled_start_time || null,
            scheduled_end_time: aiSuggestion?.scheduled_end_time || null,
          })
          .select()
          .single();

        if (error) throw error;
        addTask(data as Task);
        toast.success('Task created');
      }
      onUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleAISchedule = async () => {
    if (!user) return;
    setAiLoading(true);
    setAiSuggestion(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          task_title: title,
          task_description: description,
          estimated_duration_minutes: duration,
          deadline: fromLocalDateTimeInput(deadline),
          priority,
          events: events.map((e) => ({
            start_time: e.start_time,
            end_time: e.end_time,
            title: e.title,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed (${response.status})`);
      }

      const data = await response.json();

      if (!data.scheduled_start_time || !data.scheduled_end_time) {
        throw new Error('AI could not find a suitable time slot');
      }

      setAiSuggestion({
        scheduled_start_time: data.scheduled_start_time,
        scheduled_end_time: data.scheduled_end_time,
        reasoning: data.reasoning || 'AI-optimized time slot',
      });
      toast.success('AI found an optimal time slot!');
    } catch (error: any) {
      toast.error(error.message || 'AI scheduling failed');
    } finally {
      setAiLoading(false);
    }
  };

  const acceptSuggestion = () => {
    toast.success('AI suggestion accepted');
  };

  const rejectSuggestion = () => {
    setAiSuggestion(null);
    toast.info('AI suggestion dismissed');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update task details and schedule' : 'Create a task and let AI find the best time'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Math Assignment 3"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Chapter 5 problems 1-10"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                min={15}
                step={15}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {/* AI Suggestion section */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AI Auto-Schedule</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAISchedule}
                disabled={aiLoading || !title.trim()}
                className="gap-1.5"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? 'Finding...' : 'Find Slot'}
              </Button>
            </div>

            {aiSuggestion && (
              <div className="mt-3 space-y-2 animate-fade-in">
                <div className="rounded-md bg-card p-3 border border-primary/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {format(new Date(aiSuggestion.scheduled_start_time), 'EEEE, MMM d')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(aiSuggestion.scheduled_start_time), 'h:mm a')} —{' '}
                        {format(new Date(aiSuggestion.scheduled_end_time), 'h:mm a')}
                      </p>
                      {aiSuggestion.reasoning && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          {aiSuggestion.reasoning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={acceptSuggestion}
                    className="gap-1.5 flex-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rejectSuggestion}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : task ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
