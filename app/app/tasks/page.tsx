'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEventStore } from '@/lib/event-store';
import { supabase, type Task, type TaskPriority, type TaskStatus } from '@/lib/supabase/client';
import { TaskDialog } from '@/components/task-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckSquare, Clock, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

const priorityColors: Record<TaskPriority, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const statusColors: Record<TaskStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export default function TasksPage() {
  const { user } = useAuth();
  const { tasks, fetchTasks } = useEventStore();
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await fetchTasks(user.id);
    setLoading(false);
  }, [user, fetchTasks]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id);

    if (error) {
      toast.error('Failed to update task status');
      return;
    }

    useEventStore.getState().updateTask(task.id, { status: newStatus });
    toast.success('Task status updated');
  };

  const handleDelete = async (taskId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      toast.error('Failed to delete task');
      return;
    }
    useEventStore.getState().removeTask(taskId);
    toast.success('Task deleted');
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    const statusOrder: Record<TaskStatus, number> = { PENDING: 0, IN_PROGRESS: 1, COMPLETED: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage assignments and auto-schedule with AI
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTask(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sortedTasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <CheckSquare className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No tasks yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create a new task and let AI find the perfect time slot in your schedule.
            </p>
            <Button
              onClick={() => {
                setEditingTask(null);
                setDialogOpen(true);
              }}
              className="mt-4 gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Your First Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sortedTasks.map((task) => (
            <Card
              key={task.id}
              className={cn(
                'transition-all hover:shadow-md',
                task.status === 'COMPLETED' && 'opacity-60'
              )}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <button
                  onClick={() => {
                    const next: Record<TaskStatus, TaskStatus> = {
                      PENDING: 'IN_PROGRESS',
                      IN_PROGRESS: 'COMPLETED',
                      COMPLETED: 'PENDING',
                    };
                    handleStatusChange(task, next[task.status]);
                  }}
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                    task.status === 'COMPLETED'
                      ? 'border-green-500 bg-green-500 text-white'
                      : task.status === 'IN_PROGRESS'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-muted-foreground/30 hover:border-primary'
                  )}
                >
                  {task.status === 'COMPLETED' && <CheckSquare className="h-3.5 w-3.5" />}
                  {task.status === 'IN_PROGRESS' && (
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3
                        className={cn(
                          'font-semibold',
                          task.status === 'COMPLETED' && 'line-through'
                        )}
                      >
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={priorityColors[task.priority]} variant="secondary">
                        {task.priority}
                      </Badge>
                      <Badge className={statusColors[task.status]} variant="secondary">
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {task.estimated_duration_minutes} min
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1',
                        isPast(new Date(task.deadline)) && task.status !== 'COMPLETED'
                          ? 'text-destructive font-medium'
                          : ''
                      )}
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      Due {format(new Date(task.deadline), 'MMM d, h:mm a')}
                    </span>
                    {task.scheduled_start_time && (
                      <span className="flex items-center gap-1 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        Scheduled: {format(new Date(task.scheduled_start_time), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingTask(task);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(task.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TaskDialog
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdated={loadTasks}
      />
    </div>
  );
}
