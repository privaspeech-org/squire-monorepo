import { listTasks } from '@squire/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      const sendUpdate = () => {
        try {
          const tasks = listTasks();
          const stats = {
            total: tasks.length,
            pending: tasks.filter((t) => t.status === 'pending').length,
            running: tasks.filter((t) => t.status === 'running').length,
            completed: tasks.filter((t) => t.status === 'completed').length,
            failed: tasks.filter((t) => t.status === 'failed').length,
            withPr: tasks.filter((t) => t.prUrl).length,
            prMerged: tasks.filter((t) => t.prMerged).length,
          };

          const data = JSON.stringify({ tasks, stats, timestamp: Date.now() });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          console.error('Error sending SSE update:', error);
        }
      };

      // Send initial data immediately
      sendUpdate();

      // Poll and send updates every 2 seconds
      const interval = setInterval(sendUpdate, 2000);

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Connection closed
        }
      }, 15000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(interval);
        clearInterval(heartbeat);
      };

      // Handle abort signal
      // Note: In Next.js App Router, there's no direct access to request abort
      // The stream will be closed when the client disconnects

      // Return cleanup function for when stream is cancelled
      return cleanup;
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
