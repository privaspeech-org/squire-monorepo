'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Play, StopCircle, RotateCw, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Task {
  id: string;
  repo: string;
  prompt: string;
  branch?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  prUrl?: string;
  prMerged?: boolean;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface TaskCardProps {
  task: Task;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function TaskCard({ task, onStart, onStop, onRetry, onDelete }: TaskCardProps) {
  const getStatusBadge = (status: Task['status']) => {
    const variants = {
      pending: 'secondary' as const,
      running: 'warning' as const,
      completed: 'success' as const,
      failed: 'destructive' as const,
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg mb-1">{task.repo}</CardTitle>
            <CardDescription className="line-clamp-2">
              {task.prompt}
            </CardDescription>
          </div>
          <div className="ml-4">{getStatusBadge(task.status)}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          {task.branch && (
            <div>
              <span className="font-medium">Branch:</span> {task.branch}
            </div>
          )}
          <div>
            <span className="font-medium">Created:</span>{' '}
            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
          </div>
          {task.completedAt && (
            <div>
              <span className="font-medium">Completed:</span>{' '}
              {formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}
            </div>
          )}
          {task.error && (
            <div className="text-destructive">
              <span className="font-medium">Error:</span> {task.error}
            </div>
          )}
          {task.prUrl && (
            <div className="flex items-center gap-2">
              <span className="font-medium">PR:</span>
              <Link
                href={task.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                View PR <ExternalLink className="h-3 w-3" />
              </Link>
              {task.prMerged && (
                <Badge variant="success" className="ml-1">
                  Merged
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/tasks/${task.id}`}>View Details</Link>
        </Button>
        {task.status === 'pending' && onStart && (
          <Button size="sm" onClick={() => onStart(task.id)}>
            <Play className="h-4 w-4 mr-1" />
            Start
          </Button>
        )}
        {task.status === 'running' && onStop && (
          <Button size="sm" variant="destructive" onClick={() => onStop(task.id)}>
            <StopCircle className="h-4 w-4 mr-1" />
            Stop
          </Button>
        )}
        {task.status === 'failed' && onRetry && (
          <Button size="sm" onClick={() => onRetry(task.id)}>
            <RotateCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(task.id)}
            className="ml-auto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
