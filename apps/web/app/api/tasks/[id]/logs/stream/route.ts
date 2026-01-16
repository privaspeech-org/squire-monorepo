import { getTask, getBackend } from '@squire/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastLogLength = 0;

      const sendUpdate = async () => {
        try {
          const task = getTask(id);
          if (!task) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'Task not found' })}\n\n`)
            );
            return;
          }

          // Get logs if task has a container
          let logs = '';
          if (task.containerId) {
            try {
              const backend = await getBackend();
              logs = await backend.getTaskLogs(task.containerId);
            } catch {
              // Ignore errors getting logs
            }
          }

          // Only send update if logs changed or task status changed
          const currentLength = logs.length;
          if (currentLength !== lastLogLength) {
            // Send only new log content if we have previous logs
            const newLogs = lastLogLength > 0 ? logs.slice(lastLogLength) : logs;
            lastLogLength = currentLength;

            const data = JSON.stringify({
              task: {
                id: task.id,
                status: task.status,
                error: task.error,
              },
              logs: newLogs,
              fullLogs: logs,
              timestamp: Date.now(),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } else {
            // Send task status update even if logs haven't changed
            const data = JSON.stringify({
              task: {
                id: task.id,
                status: task.status,
                error: task.error,
              },
              timestamp: Date.now(),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        } catch (error) {
          console.error('Error sending log SSE update:', error);
        }
      };

      // Send initial data immediately
      await sendUpdate();

      // Poll and send updates every 1 second for logs
      const interval = setInterval(sendUpdate, 1000);

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Connection closed
        }
      }, 15000);

      // Return cleanup function
      return () => {
        clearInterval(interval);
        clearInterval(heartbeat);
      };
    },
    cancel() {
      // Stream cancelled by client
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
