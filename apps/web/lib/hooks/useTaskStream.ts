'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

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

interface TaskStreamData {
  tasks: Task[];
  stats: Stats;
  timestamp: number;
}

interface UseTaskStreamResult {
  tasks: Task[];
  stats: Stats;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

const DEFAULT_STATS: Stats = {
  total: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  withPr: 0,
  prMerged: 0,
};

export function useTaskStream(): UseTaskStreamResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const eventSource = new EventSource('/api/tasks/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: TaskStreamData = JSON.parse(event.data);
          setTasks(data.tasks);
          setStats(data.stats);
        } catch (parseError) {
          console.error('Failed to parse SSE data:', parseError);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();

        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (connectError) {
      setError('Failed to connect to task stream');
      setIsConnected(false);

      // Retry connection after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, []);

  const reconnect = useCallback(() => {
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    tasks,
    stats,
    isConnected,
    error,
    reconnect,
  };
}
