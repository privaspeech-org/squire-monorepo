import { NextResponse } from 'next/server';
import { listTasks } from '@squire/core';

export async function GET() {
  try {
    const allTasks = listTasks();

    const stats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === 'pending').length,
      running: allTasks.filter((t) => t.status === 'running').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      failed: allTasks.filter((t) => t.status === 'failed').length,
      withPr: allTasks.filter((t) => t.prUrl).length,
      prMerged: allTasks.filter((t) => t.prMerged).length,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}
