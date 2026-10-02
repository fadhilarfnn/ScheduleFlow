'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, type Profile } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Phone, Bell, Clock, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [waPrimary, setWaPrimary] = useState('');
  const [waSecondary, setWaSecondary] = useState('');
  const [waSecondaryActive, setWaSecondaryActive] = useState(false);
  const [leadTimes, setLeadTimes] = useState<number[]>([30, 10]);
  const [maxNotifications, setMaxNotifications] = useState(2);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLeadTime, setNewLeadTime] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setTimezone(profile.timezone);
      setWaPrimary(profile.wa_number_primary);
      setWaSecondary(profile.wa_number_secondary || '');
      setWaSecondaryActive(profile.is_wa_secondary_active);
      setLeadTimes(profile.notification_lead_times_minutes);
      setMaxNotifications(profile.max_notifications_per_event);
      setNotificationsEnabled(profile.is_notifications_enabled);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          timezone,
          wa_number_primary: waPrimary,
          wa_number_secondary: waSecondary || null,
          is_wa_secondary_active: waSecondaryActive,
          notification_lead_times_minutes: leadTimes,
          max_notifications_per_event: maxNotifications,
          is_notifications_enabled: notificationsEnabled,
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addLeadTime = () => {
    const val = parseInt(newLeadTime);
    if (isNaN(val) || val <= 0) return;
    if (leadTimes.includes(val)) {
      toast.info('This lead time already exists');
      return;
    }
    setLeadTimes([...leadTimes, val].sort((a, b) => b - a));
    setNewLeadTime('');
  };

  const removeLeadTime = (val: number) => {
    setLeadTimes(leadTimes.filter((t) => t !== val));
  };

  const timezones = [
    'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
    'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London',
    'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC',
  ];

  return (
    <div className="h-full p-4 lg:p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your profile and notification preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Numbers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              WhatsApp Numbers
            </CardTitle>
            <CardDescription>Configure up to 2 phone numbers for notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waPrimary">Primary Number</Label>
              <Input
                id="waPrimary"
                type="tel"
                value={waPrimary}
                onChange={(e) => setWaPrimary(e.target.value)}
                placeholder="+62 812 3456 7890"
              />
              <p className="text-xs text-muted-foreground">Include country code (e.g. +62)</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="waSecondary">Secondary Number</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={waSecondaryActive}
                    onCheckedChange={setWaSecondaryActive}
                  />
                </div>
              </div>
              <Input
                id="waSecondary"
                type="tel"
                value={waSecondary}
                onChange={(e) => setWaSecondary(e.target.value)}
                placeholder="+62 898 7654 3210"
                disabled={!waSecondaryActive}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Configure when and how often to be notified</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Enable Notifications</p>
                <p className="text-xs text-muted-foreground">Turn WhatsApp notifications on/off</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label>Notification Lead Times (minutes before event)</Label>
              <div className="flex flex-wrap gap-2">
                {leadTimes.map((time) => (
                  <Badge key={time} variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-1.5">
                    <Clock className="h-3 w-3" />
                    {time} min
                    <button
                      onClick={() => removeLeadTime(time)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    value={newLeadTime}
                    onChange={(e) => setNewLeadTime(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addLeadTime();
                      }
                    }}
                    placeholder="Add..."
                    className="w-20 h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={addLeadTime} className="h-8 px-2">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                e.g. 60 = 1 hour before, 30 = 30 min before, 10 = 10 min before
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxNotifications">Max Notifications Per Event</Label>
              <Input
                id="maxNotifications"
                type="number"
                value={maxNotifications}
                onChange={(e) => setMaxNotifications(parseInt(e.target.value) || 1)}
                min={1}
                max={10}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of reminders sent for a single event
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
