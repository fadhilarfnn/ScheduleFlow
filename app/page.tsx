'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, Loader2, Lock, Mail, User } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [waNumber, setWaNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName,
            wa_number_primary: waNumber,
          });

          if (profileError) throw profileError;
        }

        toast.success('Account created successfully!');
        router.push('/app');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
        router.push('/app');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ScheduleFlow</h1>
            <p className="text-sm text-muted-foreground">Smart Daily Planner</p>
          </div>
        </div>

        <Card className="shadow-xl border-border/60">
          <CardHeader>
            <CardTitle>{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</CardTitle>
            <CardDescription>
              {mode === 'signin'
                ? 'Sign in to manage your schedule and tasks'
                : 'Start managing your daily activities with AI'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="waNumber">WhatsApp Number</Label>
                  <Input
                    id="waNumber"
                    type="tel"
                    placeholder="+62 812 3456 7890"
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for event notifications. Include country code.
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              {mode === 'signin' ? (
                <p className="text-muted-foreground">
                  Don't have an account?{' '}
                  <button
                    onClick={() => setMode('signup')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Already have an account?{' '}
                  <button
                    onClick={() => setMode('signin')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
