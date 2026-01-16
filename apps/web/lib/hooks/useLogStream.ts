'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface TaskStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface LogStreamData {
  task: TaskStatus;
  logs?: string;
  fullLogs?: string;
  timestamp: number;
  error?: string;
}

interface UseLogStreamResult {
  logs: string;
  taskStatus: TaskStatus | null;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export function useLogStream(taskId: string): UseLogStreamResult {
  const [logs, setLogs] = useState<string>('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!taskId) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const eventSource = new EventSource(`/api/tasks/${taskId}/logs/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: LogStreamData = JSON.parse(event.data);

          if (data.error) {
            setError(data.error);
            return;
          }

          if (data.task) {
            setTaskStatus(data.task);
          }

          // Use full logs if available, otherwise append new logs
          if (data.fullLogs !== undefined) {
            setLogs(data.fullLogs);
          } else if (data.logs) {
            setLogs((prev) => prev + data.logs);
          }
        } catch (parseError) {
          console.error('Failed to parse log SSE data:', parseError);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();

        // Reconnect after 3 seconds for logs
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (connectError) {
      setError('Failed to connect to log stream');
      setIsConnected(false);

      // Retry connection after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [taskId]);

  const reconnect = useCallback(() => {
    setError(null);
    setLogs('');
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
    logs,
    taskStatus,
    isConnected,
    error,
    reconnect,
  };
}
