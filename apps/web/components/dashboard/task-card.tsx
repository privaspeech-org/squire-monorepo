'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Play, StopCircle, RotateCw, Trash2, Scroll, Sword, Shield, Skull, Github } from 'lucide-react';
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
        sealClass: 'wax-seal',
        accentColor: 'text-muted-foreground',
        icon: Scroll,
        label: 'Awaiting',
        bgGradient: 'from-muted/20 to-transparent',
      },
      running: {
        variant: 'warning' as const,
        borderColor: 'border-warning/40',
        sealClass: 'wax-seal-warning',
        accentColor: 'text-warning',
        icon: Sword,
        label: 'On Campaign',
        bgGradient: 'from-warning/10 to-transparent',
      },
      completed: {
        variant: 'success' as const,
        borderColor: 'border-accent/40',
        sealClass: 'wax-seal-success',
        accentColor: 'text-accent',
        icon: Shield,
        label: 'Victorious',
        bgGradient: 'from-accent/10 to-transparent',
      },
      failed: {
        variant: 'destructive' as const,
        borderColor: 'border-destructive/40',
        sealClass: 'wax-seal',
        accentColor: 'text-destructive',
        icon: Skull,
        label: 'Fallen',
        bgGradient: 'from-destructive/10 to-transparent',
      },
    };
    return configs[status];
  };

  const statusConfig = getStatusConfig(task.status);
  const StatusIcon = statusConfig.icon;

  return (
    <Card className={`quest-card ${statusConfig.borderColor} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10 relative overflow-hidden group`}>
      {/* Torch glow effect on hover */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-radial ${statusConfig.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Repository as Quest Name */}
            <CardTitle className="text-base font-display uppercase tracking-wider text-primary mb-2 truncate">
              {task.repo.split('/').pop() || task.repo}
            </CardTitle>
            {/* Quest Description */}
            <CardDescription className="line-clamp-2 font-body text-sm text-muted-foreground italic">
              &ldquo;{task.prompt}&rdquo;
            </CardDescription>
          </div>
          {/* Status Seal */}
          <div className={`${statusConfig.sealClass} shrink-0 animate-seal-stamp`}>
            <StatusIcon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2 text-xs font-body">
          {task.branch && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className={`${statusConfig.accentColor} text-sm`}>⚔</span>
              <span className="font-display text-primary uppercase text-[10px] tracking-wider">Banner:</span>
              <span className="truncate font-mono text-xs">{task.branch}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className={`${statusConfig.accentColor} text-sm`}>⏳</span>
            <span className="font-display text-primary uppercase text-[10px] tracking-wider">Issued:</span>
            <span className="italic">{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
          </div>
          {task.completedAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-accent text-sm">✓</span>
              <span className="font-display text-accent uppercase text-[10px] tracking-wider">Concluded:</span>
              <span className="italic">{formatDistanceToNow(new Date(task.completedAt), { addSuffix: true })}</span>
            </div>
          )}
          {task.error && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 p-2 rounded border border-destructive/30 mt-2">
              <span className="text-sm">☠</span>
              <div className="flex-1 min-w-0">
                <span className="font-display uppercase text-[10px] tracking-wider">Grave News:</span>
                <div className="text-xs mt-1 line-clamp-2 italic">{task.error}</div>
              </div>
            </div>
          )}
          {task.prUrl && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-primary text-sm">📜</span>
              <span className="font-display text-primary uppercase text-[10px] tracking-wider">Royal Decree:</span>
              <Link
                href={task.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-warning transition-colors inline-flex items-center gap-1 group/link"
              >
                <span className="group-hover/link:underline italic">View Scroll</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
              {task.prMerged && (
                <Badge variant="success" className="ml-1 text-[10px] py-0 h-4 font-display uppercase">
                  Sealed
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 border-t border-primary/10 pt-4">
        <Button
          size="sm"
          variant="outline"
          asChild
          className="font-display text-xs border-primary/30 hover:border-primary hover:bg-primary/10 uppercase tracking-wider"
        >
          <Link href={`/tasks/${task.id}`}>
            Chronicles
          </Link>
        </Button>
        {task.prUrl && (
          <Button
            size="sm"
            variant="outline"
            asChild
            className="font-display text-xs border-primary/30 hover:border-primary hover:bg-primary/10"
          >
            <Link href={task.prUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        {task.status === 'pending' && onStart && (
          <Button
            size="sm"
            onClick={() => onStart(task.id)}
            className="font-display text-xs btn-golden uppercase tracking-wider"
          >
            <Play className="h-3 w-3 mr-1" />
            Dispatch
          </Button>
        )}
        {task.status === 'running' && onStop && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onStop(task.id)}
            className="font-display text-xs uppercase tracking-wider"
          >
            <StopCircle className="h-3 w-3 mr-1" />
            Recall
          </Button>
        )}
        {task.status === 'failed' && onRetry && (
          <Button
            size="sm"
            onClick={() => onRetry(task.id)}
            className="font-display text-xs btn-golden uppercase tracking-wider"
          >
            <RotateCw className="h-3 w-3 mr-1" />
            Rally
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

      {/* Corner heraldic accent */}
      <div className={`absolute bottom-0 left-0 w-6 h-6 border-l border-b ${statusConfig.borderColor} opacity-50 pointer-events-none`} />
    </Card>
  );
}
