'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, type NotificationLog } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  PENDING: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  SENT: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: Check },
  FAILED: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_notification_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('scheduled_for', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching logs:', error);
      setLoading(false);
      return;
    }
    setLogs(data as NotificationLog[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const pendingCount = logs.filter((l) => l.status === 'PENDING').length;
  const sentCount = logs.filter((l) => l.status === 'SENT').length;
  const failedCount = logs.filter((l) => l.status === 'FAILED').length;

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          WhatsApp notification logs and delivery status
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sentCount}</p>
              <p className="text-xs text-muted-foreground">Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{failedCount}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notification History
          </CardTitle>
          <CardDescription>Recent WhatsApp notification activity</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                No notifications yet. They will appear here when events trigger reminders.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const config = statusConfig[log.status];
                const Icon = config.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        config.color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-1">
                        {log.message_content}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>To: {log.phone_number_sent}</span>
                        <span>Scheduled: {format(new Date(log.scheduled_for), 'MMM d, h:mm a')}</span>
                        {log.sent_at && (
                          <span>Sent: {format(new Date(log.sent_at), 'MMM d, h:mm a')}</span>
                        )}
                      </div>
                      {log.error_message && (
                        <p className="mt-1 text-xs text-destructive">{log.error_message}</p>
                      )}
                    </div>
                    <Badge className={cn('shrink-0', config.color)} variant="secondary">
                      {log.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
