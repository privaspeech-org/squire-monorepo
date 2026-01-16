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
        alert('Task not found');
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
        alert(`Failed to start task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to start task:', error);
      alert('Failed to start task');
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
        alert(`Failed to stop task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to stop task:', error);
      alert('Failed to stop task');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task?')) {
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
        alert(`Failed to delete task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    const variants = {
      pending: 'secondary' as const,
      running: 'warning' as const,
      completed: 'success' as const,
      failed: 'destructive' as const,
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto py-8 px-4">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Task Details</h1>
              <p className="text-muted-foreground mt-1">ID: {task.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchTask}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {task.status === 'pending' && (
              <Button onClick={handleStart}>
                <Play className="h-4 w-4 mr-2" />
                Start
              </Button>
            )}
            {task.status === 'running' && (
              <Button variant="destructive" onClick={handleStop}>
                <StopCircle className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            {task.status === 'failed' && (
              <Button onClick={handleStart}>
                <RotateCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
            <Button variant="ghost" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{task.repo}</CardTitle>
                  <CardDescription className="mt-2">{task.prompt}</CardDescription>
                </div>
                {getStatusBadge(task.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {task.branch && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Branch:</span>
                    <span className="text-muted-foreground">{task.branch}</span>
                  </div>
                )}
                {task.baseBranch && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Base Branch:</span>
                    <span className="text-muted-foreground">{task.baseBranch}</span>
                  </div>
                )}
                {task.containerId && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Container ID:</span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {task.containerId.substring(0, 12)}
                    </code>
                  </div>
                )}
              </div>

              {task.error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Error</p>
                      <p className="text-sm text-destructive/90 mt-1">{task.error}</p>
                    </div>
                  </div>
                </div>
              )}

              {task.prUrl && (
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Pull Request</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        PR #{task.prNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.prMerged && (
                        <Badge variant="success">Merged</Badge>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={task.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View PR <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>

                {task.startedAt && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Started</p>
                        <p className="text-xs text-muted-foreground">
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
                    <Separator />
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Completed</p>
                        <p className="text-xs text-muted-foreground">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Container Logs</CardTitle>
            <CardDescription>Real-time output from the task container</CardDescription>
          </CardHeader>
          <CardContent>
            {logs ? (
              <div className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">{logs}</pre>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No logs available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
