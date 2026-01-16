'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle2, Clock, XCircle, GitPullRequest, GitMerge } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    withPr: number;
    prMerged: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'TOTAL_TASKS',
      value: stats.total,
      icon: Activity,
      color: 'text-primary',
      glow: 'glow-cyan',
      border: 'border-primary/30',
    },
    {
      title: 'RUNNING',
      value: stats.running,
      icon: Clock,
      color: 'text-warning',
      glow: 'shadow-lg shadow-warning/20',
      border: 'border-warning/30',
    },
    {
      title: 'COMPLETED',
      value: stats.completed,
      icon: CheckCircle2,
      color: 'text-accent',
      glow: 'glow-green',
      border: 'border-accent/30',
    },
    {
      title: 'FAILED',
      value: stats.failed,
      icon: XCircle,
      color: 'text-destructive',
      glow: 'glow-red',
      border: 'border-destructive/30',
    },
    {
      title: 'PULL_REQUESTS',
      value: stats.withPr,
      icon: GitPullRequest,
      color: 'text-secondary',
      glow: 'glow-magenta',
      border: 'border-secondary/30',
    },
    {
      title: 'PR_MERGED',
      value: stats.prMerged,
      icon: GitMerge,
      color: 'text-primary',
      glow: 'shadow-lg shadow-primary/20',
      border: 'border-primary/30',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className={`${card.border} bg-card/50 backdrop-blur-sm border hover:${card.glow} transition-all duration-300 hover:scale-105 relative overflow-hidden group`}
          >
            {/* Corner accent */}
            <div className={`absolute top-0 right-0 w-12 h-12 ${card.color} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`} />

            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-xs font-mono font-bold ${card.color} uppercase tracking-wider`}>
                {card.title}
              </CardTitle>
              <Icon className={`h-5 w-5 ${card.color} animate-pulse-glow`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-display font-bold ${card.color} tabular-nums`}>
                {card.value.toString().padStart(2, '0')}
              </div>
              <div className="text-xs font-mono text-muted-foreground mt-1">
                <span className={card.color}>{'>'}</span> SYS_STAT_{index.toString().padStart(2, '0')}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
