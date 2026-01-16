'use client';

import { useEffect, useState } from 'react';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { TaskCard } from '@/components/dashboard/task-card';
import { NewTaskDialog } from '@/components/dashboard/new-task-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

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

interface Stats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  withPr: number;
  prMerged: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    withPr: 0,
    prMerged: 0,
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = async () => {
    try {
      const [statsRes, tasksRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/tasks'),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }

      if (tasksRes.ok) {
        setTasks(await tasksRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}/start`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchData();
      } else {
        const error = await response.json();
        alert(`Failed to start task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to start task:', error);
      alert('Failed to start task');
    }
  };

  const handleStop = async (id: string) => {
    try {
      const response = await fetch(`/api/tasks/${id}/stop`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchData();
      } else {
        const error = await response.json();
        alert(`Failed to stop task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to stop task:', error);
      alert('Failed to stop task');
    }
  };

  const handleRetry = async (id: string) => {
    handleStart(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Art thou certain thou wishest to abandon this quest?')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      } else {
        const error = await response.json();
        alert(`Failed to delete task: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  const filterTasks = (status?: string) => {
    if (!status || status === 'all') return tasks;
    return tasks.filter((task) => task.status === status);
  };

  const filteredTasks = filterTasks(activeTab);

  return (
    <div className="min-h-screen relative stone-bg">
      {/* Decorative torch glow in corners */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-gradient-radial from-amber-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="fixed top-0 right-0 w-96 h-96 bg-gradient-radial from-amber-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Top decorative border */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />

      <div className="container mx-auto py-8 px-4 space-y-8 relative z-10">
        {/* Royal Header Banner */}
        <header className="animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-display font-bold tracking-wide text-primary text-glow-gold uppercase">
                Squire
              </h1>
              <div className="flex items-center gap-2">
                <span className="fleur-de-lis text-sm"></span>
                <span className="text-muted-foreground font-body text-sm italic">
                  Quest Chamber of the Realm
                </span>
                <span className="fleur-de-lis text-sm"></span>
              </div>
            </div>

            <div className="flex gap-3 items-center">
              <Button
                variant="outline"
                size="icon"
                onClick={fetchData}
                className="border-primary/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <NewTaskDialog onTaskCreated={fetchData} />
            </div>
          </div>

          {/* Decorative divider */}
          <div className="manuscript-divider mt-6">
            <span className="fleur-de-lis text-sm opacity-60"></span>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="font-body text-primary animate-torch-flicker flex items-center gap-3 text-lg italic">
              <span className="wax-seal-warning text-xs">⌛</span>
              Consulting the ancient scrolls...
            </div>
          </div>
        ) : (
          <>
            {/* Stats Section - Tavern Board Style */}
            <section className="animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-display font-semibold text-primary uppercase tracking-wider">
                  Realm Status
                </h2>
                <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
              </div>
              <StatsCards stats={stats} />
            </section>

            {/* Quests Section */}
            <section className="animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-display font-semibold text-primary uppercase tracking-wider">
                    Quest Ledger
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
                </div>

                <TabsList className="border border-primary/20 bg-card/50 backdrop-blur-sm p-1">
                  <TabsTrigger
                    value="all"
                    className="font-display text-sm data-[state=active]:text-primary data-[state=active]:bg-primary/10 uppercase tracking-wide"
                  >
                    All Quests <span className="text-muted-foreground ml-1 font-mono text-xs">{tasks.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="font-display text-sm data-[state=active]:text-warning data-[state=active]:bg-warning/10 uppercase tracking-wide"
                  >
                    Awaiting <span className="text-muted-foreground ml-1 font-mono text-xs">{stats.pending}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="running"
                    className="font-display text-sm data-[state=active]:text-warning data-[state=active]:bg-warning/10 uppercase tracking-wide"
                  >
                    On Campaign <span className="text-muted-foreground ml-1 font-mono text-xs">{stats.running}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="font-display text-sm data-[state=active]:text-accent data-[state=active]:bg-accent/10 uppercase tracking-wide"
                  >
                    Victorious <span className="text-muted-foreground ml-1 font-mono text-xs">{stats.completed}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="failed"
                    className="font-display text-sm data-[state=active]:text-destructive data-[state=active]:bg-destructive/10 uppercase tracking-wide"
                  >
                    Fallen <span className="text-muted-foreground ml-1 font-mono text-xs">{stats.failed}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-6">
                  {filteredTasks.length === 0 ? (
                    <div className="text-center py-16 parchment-card rounded-lg">
                      <div className="wax-seal mx-auto mb-4">?</div>
                      <div className="font-display text-lg text-muted-foreground uppercase tracking-wider">
                        No Quests Found
                      </div>
                      <div className="font-body text-sm text-muted-foreground mt-2 italic">
                        Issue a new decree to dispatch thy squire
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="animate-unfurl"
                          style={{
                            animationDelay: `${0.1 + (index * 0.05)}s`,
                            animationFillMode: 'both'
                          }}
                        >
                          <TaskCard
                            task={task}
                            onStart={handleStart}
                            onStop={handleStop}
                            onRetry={handleRetry}
                            onDelete={handleDelete}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </section>
          </>
        )}
      </div>

      {/* Bottom decorative corners */}
      <div className="fixed bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-primary/20 pointer-events-none" />
      <div className="fixed bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-primary/20 pointer-events-none" />
    </div>
  );
}
