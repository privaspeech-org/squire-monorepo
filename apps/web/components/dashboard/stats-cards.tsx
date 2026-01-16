'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scroll, Sword, Shield, Skull, BookOpen, Crown } from 'lucide-react';

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
      title: 'Total Quests',
      value: stats.total,
      icon: BookOpen,
      color: 'text-primary',
      sealClass: 'wax-seal-warning',
      border: 'border-primary/30',
      description: 'In the ledger',
    },
    {
      title: 'On Campaign',
      value: stats.running,
      icon: Sword,
      color: 'text-warning',
      sealClass: 'wax-seal-warning',
      border: 'border-warning/30',
      description: 'Knights abroad',
    },
    {
      title: 'Victorious',
      value: stats.completed,
      icon: Shield,
      color: 'text-accent',
      sealClass: 'wax-seal-success',
      border: 'border-accent/30',
      description: 'Quests fulfilled',
    },
    {
      title: 'Fallen',
      value: stats.failed,
      icon: Skull,
      color: 'text-destructive',
      sealClass: 'wax-seal',
      border: 'border-destructive/30',
      description: 'In memoriam',
    },
    {
      title: 'Royal Decrees',
      value: stats.withPr,
      icon: Scroll,
      color: 'text-primary',
      sealClass: 'wax-seal-warning',
      border: 'border-primary/30',
      description: 'Scrolls drafted',
    },
    {
      title: 'Sealed',
      value: stats.prMerged,
      icon: Crown,
      color: 'text-primary',
      sealClass: 'wax-seal-success',
      border: 'border-primary/30',
      description: 'Royal approval',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.title}
            className={`tavern-board ${card.border} transition-all duration-300 hover:scale-105 relative overflow-hidden group rounded-sm`}
          >
            {/* Torch glow on hover */}
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-radial from-amber-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className={`text-xs font-display font-semibold ${card.color} uppercase tracking-wider`}>
                {card.title}
              </CardTitle>
              <div className={`${card.sealClass} w-8 h-8 text-[10px] flex items-center justify-center`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className={`text-3xl font-display font-bold ${card.color} tabular-nums`}>
                {card.value.toString().padStart(2, '0')}
              </div>
              <div className="text-[10px] font-body text-muted-foreground mt-1 italic">
                {card.description}
              </div>
            </CardContent>

            {/* Corner accent */}
            <div className="absolute bottom-1 left-1 w-3 h-3 border-l border-b border-primary/20" />
          </Card>
        );
      })}
    </div>
  );
}
