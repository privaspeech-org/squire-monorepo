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
  const getStatusConfig = (status: Task['status']) => {
    const configs = {
      pending: {
        variant: 'secondary' as const,
        borderColor: 'border-muted',
        glowClass: '',
        accentColor: 'text-muted-foreground',
      },
      running: {
        variant: 'warning' as const,
        borderColor: 'border-warning/40',
        glowClass: 'shadow-lg shadow-warning/20 animate-pulse-glow',
        accentColor: 'text-warning',
      },
      completed: {
        variant: 'success' as const,
        borderColor: 'border-accent/40',
        glowClass: 'glow-green',
        accentColor: 'text-accent',
      },
      failed: {
        variant: 'destructive' as const,
        borderColor: 'border-destructive/40',
        glowClass: 'glow-red',
        accentColor: 'text-destructive',
      },
    };
    return configs[status];
  };

  const statusConfig = getStatusConfig(task.status);

  return (
    <Card className={`${statusConfig.borderColor} bg-card/50 backdrop-blur-sm border ${statusConfig.glowClass} transition-all duration-300 hover:scale-[1.02] relative overflow-hidden group`}>
      {/* Status indicator strip */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-current to-transparent ${statusConfig.accentColor} opacity-60`} />

      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-display uppercase tracking-wider text-primary mb-2 truncate">
              {task.repo.split('/').pop() || task.repo}
            </CardTitle>
            <CardDescription className="line-clamp-2 font-mono text-xs text-muted-foreground">
              <span className="text-primary">{'>'}</span> {task.prompt}
            </CardDescription>
          </div>
          <Badge variant={statusConfig.variant} className="font-mono text-xs uppercase shrink-0">
            {task.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 text-xs font-mono">
          {task.branch && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className={statusConfig.accentColor}>{'>'}</span>
              <span className="text-primary font-semibold">BRANCH:</span>
              <span className="truncate">{task.branch}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className={statusConfig.accentColor}>{'>'}</span>
            <span className="text-primary font-semibold">CREATED:</span>
            <span>{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
          </div>
          {task.completedAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-accent">{'>'}</span>
              <span className="text-accent font-semibold">DONE:</span>
              <span>{formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}</span>
            </div>
          )}
          {task.error && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 p-2 rounded border border-destructive/30">
              <span>{'>'}</span>
              <div className="flex-1 min-w-0">
                <span className="font-semibold">ERROR:</span>
                <div className="text-xs mt-1 line-clamp-2">{task.error}</div>
              </div>
            </div>
          )}
          {task.prUrl && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-secondary">{'>'}</span>
              <span className="text-secondary font-semibold">PR:</span>
              <Link
                href={task.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-secondary transition-colors inline-flex items-center gap-1 group/link"
              >
                <span className="group-hover/link:underline">OPEN</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
              {task.prMerged && (
                <Badge variant="success" className="ml-1 text-[10px] py-0 h-4">
                  MERGED
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 border-t border-primary/10 pt-4">
        <Button size="sm" variant="outline" asChild className="font-mono text-xs border-primary/30 hover:border-primary hover:glow-cyan">
          <Link href={`/tasks/${task.id}`}>
            VIEW_LOGS
          </Link>
        </Button>
        {task.status === 'pending' && onStart && (
          <Button size="sm" onClick={() => onStart(task.id)} className="font-mono text-xs glow-cyan">
            <Play className="h-3 w-3 mr-1" />
            START
          </Button>
        )}
        {task.status === 'running' && onStop && (
          <Button size="sm" variant="destructive" onClick={() => onStop(task.id)} className="font-mono text-xs glow-red">
            <StopCircle className="h-3 w-3 mr-1" />
            STOP
          </Button>
        )}
        {task.status === 'failed' && onRetry && (
          <Button size="sm" onClick={() => onRetry(task.id)} className="font-mono text-xs glow-cyan">
            <RotateCw className="h-3 w-3 mr-1" />
            RETRY
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(task.id)}
            className="ml-auto hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>

      {/* Corner accent */}
      <div className={`absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 ${statusConfig.borderColor} opacity-50 pointer-events-none`} />
    </Card>
  );
}
