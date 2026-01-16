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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Squire</h1>
            <p className="text-muted-foreground mt-2">
              Autonomous Coding Agent Dashboard
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <NewTaskDialog onTaskCreated={fetchData} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : (
          <>
            <StatsCards stats={stats} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
                <TabsTrigger value="pending">
                  Pending ({stats.pending})
                </TabsTrigger>
                <TabsTrigger value="running">
                  Running ({stats.running})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({stats.completed})
                </TabsTrigger>
                <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-6">
                {filteredTasks.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No tasks found. Create a new task to get started.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onStart={handleStart}
                        onStop={handleStop}
                        onRetry={handleRetry}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
