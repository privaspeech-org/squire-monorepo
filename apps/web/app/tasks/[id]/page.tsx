'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  ExternalLink,
  Play,
  StopCircle,
  RotateCw,
  Trash2,
  RefreshCw,
  GitBranch,
  Calendar,
  Clock,
  AlertCircle,
  Scroll,
  Sword,
  Shield,
  Skull,
  BookOpen,
  Github,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Task {
  id: string;
  repo: string;
  prompt: string;
  branch?: string;
  baseBranch?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  containerId?: string;
  prUrl?: string;
  prNumber?: number;
  prMerged?: boolean;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchTask = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}`);
      if (response.ok) {
        setTask(await response.json());
      } else if (response.status === 404) {
        alert('Quest not found in the archives');
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to fetch task:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || '');
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  useEffect(() => {
    fetchTask();
    fetchLogs();

    // Poll for updates every 3 seconds
    const interval = setInterval(() => {
      fetchTask();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  const handleStart = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}/start`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchTask();
      } else {
        const error = await response.json();
        alert(`Failed to dispatch squire: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to start task:', error);
      alert('Failed to dispatch squire');
    }
  };

  const handleStop = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}/stop`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchTask();
      } else {
        const error = await response.json();
        alert(`Failed to recall squire: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to stop task:', error);
      alert('Failed to recall squire');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Art thou certain thou wishest to abandon this quest and burn its records?')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/');
      } else {
        const error = await response.json();
        alert(`Failed to abandon quest: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to abandon quest');
    }
  };

  const getStatusConfig = (status: Task['status']) => {
    const configs = {
      pending: { variant: 'secondary' as const, icon: Scroll, label: 'Awaiting Orders', sealClass: 'wax-seal' },
      running: { variant: 'warning' as const, icon: Sword, label: 'On Campaign', sealClass: 'wax-seal-warning' },
      completed: { variant: 'success' as const, icon: Shield, label: 'Victorious', sealClass: 'wax-seal-success' },
      failed: { variant: 'destructive' as const, icon: Skull, label: 'Fallen', sealClass: 'wax-seal' },
    };
    return configs[status];
  };

  if (loading) {
    return (
      <div className="min-h-screen stone-bg">
        <div className="parchment-texture" />
        <div className="container mx-auto py-8 px-4 relative z-10">
          <div className="flex items-center justify-center py-12">
            <div className="font-body text-primary animate-torch-flicker flex items-center gap-3 text-lg italic">
              <span className="wax-seal-warning text-xs">⌛</span>
              Retrieving quest from the archives...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  const statusConfig = getStatusConfig(task.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-screen stone-bg">
      <div className="parchment-texture" />

      {/* Top decorative border */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 z-20" />

      <div className="container mx-auto py-8 px-4 space-y-6 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="hover:bg-primary/10">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className={statusConfig.sealClass}>
                  <StatusIcon className="h-4 w-4" />
                </div>
                <h1 className="text-3xl font-display font-bold tracking-wide text-primary text-glow-gold uppercase">
                  Quest Chronicle
                </h1>
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-sm">
                Record #{task.id}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchTask} className="border-primary/30 hover:border-primary">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {(task.status === 'completed' || task.status === 'failed') && task.prUrl && (
              <Button asChild className="font-display uppercase tracking-wider text-xs">
                <Link href={task.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  <span>View Pull Request</span>
                </Link>
              </Button>
            )}
            {!(task.status === 'completed' || task.status === 'failed') && task.prUrl && (
              <Button variant="outline" size="icon" asChild className="border-primary/30 hover:border-primary">
                <Link href={task.prUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {task.status === 'pending' && (
              <Button onClick={handleStart} className="btn-golden font-display uppercase tracking-wider">
                <Play className="h-4 w-4 mr-2" />
                Dispatch
              </Button>
            )}
            {task.status === 'running' && (
              <Button variant="destructive" onClick={handleStop} className="font-display uppercase tracking-wider">
                <StopCircle className="h-4 w-4 mr-2" />
                Recall
              </Button>
            )}
            {task.status === 'failed' && (
              <Button onClick={handleStart} className="btn-golden font-display uppercase tracking-wider">
                <RotateCw className="h-4 w-4 mr-2" />
                Rally Again
              </Button>
            )}
            <Button variant="ghost" onClick={handleDelete} className="hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Decorative divider */}
        <div className="manuscript-divider">
          <span className="fleur-de-lis text-sm opacity-60"></span>
        </div>

        <div className="grid gap-6 md:grid-cols-3 animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
          {/* Main Quest Details */}
          <Card className="md:col-span-2 quest-card">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-xl font-display uppercase tracking-wider text-primary">
                    {task.repo.split('/').pop() || task.repo}
                  </CardTitle>
                  <CardDescription className="font-body text-base text-muted-foreground italic">
                    &ldquo;{task.prompt}&rdquo;
                  </CardDescription>
                </div>
                <Badge variant={statusConfig.variant} className="font-display uppercase tracking-wider">
                  {statusConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {task.branch && (
                  <div className="flex items-center gap-3 text-sm font-body">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <span className="font-display text-primary uppercase text-xs tracking-wider">Banner:</span>
                    <span className="text-muted-foreground font-mono">{task.branch}</span>
                  </div>
                )}
                {task.baseBranch && (
                  <div className="flex items-center gap-3 text-sm font-body">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-display text-muted-foreground uppercase text-xs tracking-wider">Origin Keep:</span>
                    <span className="text-muted-foreground font-mono">{task.baseBranch}</span>
                  </div>
                )}
                {task.containerId && (
                  <div className="flex items-center gap-3 text-sm font-body">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-display text-muted-foreground uppercase text-xs tracking-wider">Vessel ID:</span>
                    <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono">
                      {task.containerId.substring(0, 12)}
                    </code>
                  </div>
                )}
              </div>

              {task.error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-display text-destructive uppercase tracking-wider text-sm">Grave News</p>
                      <p className="text-sm text-destructive/90 mt-1 font-body italic">{task.error}</p>
                    </div>
                  </div>
                </div>
              )}

              {task.prUrl && (
                <div className="parchment-card rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-primary uppercase tracking-wider text-sm">Royal Decree</p>
                      <p className="text-sm text-muted-foreground mt-1 font-body italic">
                        Scroll #{task.prNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.prMerged && (
                        <Badge variant="success" className="font-display uppercase tracking-wider">
                          Sealed by Crown
                        </Badge>
                      )}
                      <Button size="sm" variant="outline" asChild className="border-primary/30 hover:border-primary font-display uppercase tracking-wider text-xs">
                        <Link
                          href={task.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View Scroll <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Card */}
          <Card className="tavern-board rounded-sm">
            <CardHeader>
              <CardTitle className="text-lg font-display uppercase tracking-wider text-primary">Chronicle of Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="wax-seal-warning w-7 h-7 text-[8px] flex items-center justify-center">
                    <Calendar className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display text-primary uppercase tracking-wider">Quest Issued</p>
                    <p className="text-xs text-muted-foreground font-body italic">
                      {formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>

                {task.startedAt && (
                  <>
                    <Separator className="bg-primary/20" />
                    <div className="flex items-start gap-3">
                      <div className="wax-seal-warning w-7 h-7 text-[8px] flex items-center justify-center">
                        <Sword className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display text-warning uppercase tracking-wider">Campaign Begun</p>
                        <p className="text-xs text-muted-foreground font-body italic">
                          {formatDistanceToNow(new Date(task.startedAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {task.completedAt && (
                  <>
                    <Separator className="bg-primary/20" />
                    <div className="flex items-start gap-3">
                      <div className="wax-seal-success w-7 h-7 text-[8px] flex items-center justify-center">
                        <Shield className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display text-accent uppercase tracking-wider">Quest Concluded</p>
                        <p className="text-xs text-muted-foreground font-body italic">
                          {formatDistanceToNow(new Date(task.completedAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs Section */}
        <Card className="quest-card animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wider text-primary flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Squire&apos;s Journal
            </CardTitle>
            <CardDescription className="font-body italic text-muted-foreground">
              Dispatches and observations from the field
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs ? (
              <div className="aged-paper p-4 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/90 relative z-10">{logs}</pre>
              </div>
            ) : (
              <div className="text-center py-12 parchment-card rounded-lg">
                <div className="wax-seal mx-auto mb-4">?</div>
                <div className="font-body text-muted-foreground italic">
                  The journal remains empty... no dispatches yet received
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom decorative corners */}
      <div className="fixed bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-primary/20 pointer-events-none z-20" />
      <div className="fixed bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-primary/20 pointer-events-none z-20" />
    </div>
  );
}
