'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, type CalendarEvent } from '@/lib/supabase/client';
import { useEventStore } from '@/lib/event-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Upload, Loader2, Check, X, FileUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ParsedEvent = {
  title: string;
  description: string;
  location: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  recurrence_until: string;
};

const dayNameToNumber: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export default function PdfParserPage() {
  const { user } = useAuth();
  const { addEvent } = useEventStore();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([]);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setParsedEvents([]);
      setConfirmed(false);
    } else {
      toast.error('Please upload a PDF file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setParsedEvents([]);
      setConfirmed(false);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setParsedEvents([]);
    setConfirmed(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-parse-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          pdf_base64: base64,
          filename: file.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Parse failed (${response.status})`);
      }

      const data = await response.json();

      if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
        throw new Error('No classes detected in the PDF');
      }

      setParsedEvents(data.events);
      toast.success(`Parsed ${data.events.length} classes from PDF!`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to parse PDF');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!user || parsedEvents.length === 0) return;
    setImporting(true);

    try {
      const now = new Date();
      const dayOfWeekNow = now.getDay();

      const eventsToInsert = parsedEvents.map((parsed) => {
        const dayNum = dayNameToNumber[parsed.day_of_week.toLowerCase()] ?? 1;
        const diff = (dayNum - dayOfWeekNow + 7) % 7;
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() + diff);

        const [startH, startM] = parsed.start_time.split(':').map(Number);
        startDate.setHours(startH, startM, 0, 0);

        const endDate = new Date(startDate);
        const [endH, endM] = parsed.end_time.split(':').map(Number);
        endDate.setHours(endH, endM, 0, 0);

        const recurrenceUntil = parsed.recurrence_until
          ? new Date(parsed.recurrence_until).toISOString().split('T')[0]
          : undefined;

        return {
          user_id: user.id,
          title: parsed.title,
          description: parsed.description || null,
          location: parsed.location || null,
          source_type: 'PDF_PARSED' as const,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          is_recurring: true,
          recurrence_day_of_week: dayNum,
          recurrence_until: recurrenceUntil || null,
        };
      });

      const { data, error } = await supabase
        .from('events')
        .insert(eventsToInsert)
        .select();

      if (error) throw error;

      (data as CalendarEvent[]).forEach((e) => addEvent(e));
      toast.success(`Imported ${data.length} events to your calendar!`);
      setConfirmed(true);
      setFile(null);
      setParsedEvents([]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to import events');
    } finally {
      setImporting(false);
    }
  };

  const removeParsedEvent = (index: number) => {
    setParsedEvents((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">PDF Schedule Parser</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload your university schedule PDF and let AI extract your classes
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload section */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-primary" />
                Upload Schedule
              </CardTitle>
              <CardDescription>Drag and drop your PDF schedule file</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file ? (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <p className="mt-3 font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <Upload className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-medium text-sm">Drop your PDF here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                  </>
                )}
              </div>

              {file && (
                <div className="mt-4 space-y-2">
                  <Button
                    onClick={handleParse}
                    disabled={parsing}
                    className="w-full gap-2"
                  >
                    {parsing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {parsing ? 'Parsing with AI...' : 'Parse with AI'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFile(null);
                      setParsedEvents([]);
                      setConfirmed(false);
                    }}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {confirmed && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  Events imported to your calendar successfully!
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview section */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Parsed Classes</span>
                {parsedEvents.length > 0 && (
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    size="sm"
                    className="gap-1.5"
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Import All
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {parsedEvents.length > 0
                  ? `${parsedEvents.length} classes found — review before importing`
                  : 'Parsed classes will appear here'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parsedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    No classes parsed yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-auto scrollbar-thin">
                  {parsedEvents.map((event, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--event-pdf))] text-white">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.day_of_week} · {event.start_time}–{event.end_time}
                          {event.location && ` · ${event.location}`}
                        </p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeParsedEvent(index)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
