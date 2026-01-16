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
    if (!confirm('Are you sure you want to delete this task?')) {
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
    <div className="min-h-screen relative grid-bg">
      {/* Diagonal accent line */}
      <div className="fixed top-0 left-0 w-1 h-full bg-gradient-to-b from-primary via-secondary to-accent opacity-50 animate-pulse-glow"
           style={{ transform: 'translateX(-1px)' }} />

      {/* Top border glow */}
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse-glow" />

      <div className="container mx-auto py-8 px-4 space-y-8 relative">
        {/* Terminal-style header */}
        <div className="flex items-center justify-between animate-slide-in-up">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-primary text-sm font-mono animate-flicker">$</span>
              <h1 className="text-5xl font-display font-bold tracking-wider text-primary text-glow-cyan uppercase">
                SQUIRE
              </h1>
              <span className="text-secondary text-2xl font-display animate-pulse-glow">//</span>
            </div>
            <div className="font-mono text-sm text-muted-foreground border-l-2 border-primary pl-4 ml-1">
              <span className="text-accent">{'>'}</span> Autonomous_Coding_Agent_Dashboard
              <span className="animate-pulse">_</span>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              size="icon"
              onClick={fetchData}
              className="glow-cyan border-primary/30 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <NewTaskDialog onTaskCreated={fetchData} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="font-mono text-primary animate-pulse flex items-center gap-2">
              <span className="text-accent">{'>'}</span>
              Loading system data
              <span className="animate-pulse">...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
              <StatsCards stats={stats} />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="border border-primary/20 bg-card/50 backdrop-blur-sm">
                  <TabsTrigger value="all" className="font-mono data-[state=active]:text-primary data-[state=active]:glow-cyan">
                    ALL <span className="text-muted-foreground ml-1">[{tasks.length}]</span>
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="font-mono data-[state=active]:text-warning">
                    PENDING <span className="text-muted-foreground ml-1">[{stats.pending}]</span>
                  </TabsTrigger>
                  <TabsTrigger value="running" className="font-mono data-[state=active]:text-warning">
                    RUNNING <span className="text-muted-foreground ml-1">[{stats.running}]</span>
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="font-mono data-[state=active]:text-accent">
                    DONE <span className="text-muted-foreground ml-1">[{stats.completed}]</span>
                  </TabsTrigger>
                  <TabsTrigger value="failed" className="font-mono data-[state=active]:text-destructive">
                    FAIL <span className="text-muted-foreground ml-1">[{stats.failed}]</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-6">
                  {filteredTasks.length === 0 ? (
                    <div className="text-center py-12 border border-primary/20 rounded bg-card/30 backdrop-blur-sm">
                      <div className="font-mono text-muted-foreground">
                        <span className="text-destructive">{'> ERROR:'}</span> No tasks found
                      </div>
                      <div className="font-mono text-sm text-muted-foreground mt-2">
                        <span className="text-accent">{'>'}</span> Initialize new task to begin_
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="animate-slide-in-up"
                          style={{
                            animationDelay: `${0.3 + (index * 0.05)}s`,
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
            </div>
          </>
        )}
      </div>

      {/* Bottom corner accent */}
      <div className="fixed bottom-4 right-4 w-24 h-24 border-r-2 border-b-2 border-secondary/30 pointer-events-none" />
    </div>
  );
}
