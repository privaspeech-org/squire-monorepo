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
      title: 'Total Tasks',
      value: stats.total,
      icon: Activity,
      color: 'text-blue-600',
    },
    {
      title: 'Running',
      value: stats.running,
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      title: 'Completed',
      value: stats.completed,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      title: 'Failed',
      value: stats.failed,
      icon: XCircle,
      color: 'text-red-600',
    },
    {
      title: 'Pull Requests',
      value: stats.withPr,
      icon: GitPullRequest,
      color: 'text-purple-600',
    },
    {
      title: 'PRs Merged',
      value: stats.prMerged,
      icon: GitMerge,
      color: 'text-indigo-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
