import { NextResponse } from 'next/server';
import { exportMetrics, listTasks, setGauge } from '@squire/core';

export async function GET() {
  try {
    // Update gauges with current state before exporting
    const tasks = listTasks();
    const runningTasks = tasks.filter(t => t.status === 'running').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;

    setGauge('squire_tasks_running', runningTasks);
    setGauge('squire_tasks_pending', pendingTasks);
    setGauge('squire_tasks_total', tasks.length);

    // Export metrics in Prometheus format
    const metrics = exportMetrics();

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Failed to export metrics:', error);
    return NextResponse.json(
      { error: 'Failed to export metrics' },
      { status: 500 }
    );
  }
}
