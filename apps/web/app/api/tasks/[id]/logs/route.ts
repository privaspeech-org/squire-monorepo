import { NextResponse } from 'next/server';
import { getTask, getContainerLogs } from '@squire/core';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = getTask(id);

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    if (!task.containerId) {
      return NextResponse.json({ logs: '' });
    }

    const logs = await getContainerLogs(task.containerId);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Failed to get logs:', error);
    return NextResponse.json(
      { error: 'Failed to get logs' },
      { status: 500 }
    );
  }
}
