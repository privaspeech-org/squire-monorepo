import { NextResponse } from 'next/server';
import { getTask, updateTask, stopContainer } from '@squire/core';

export async function POST(
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
      return NextResponse.json(
        { error: 'Task has no running container' },
        { status: 400 }
      );
    }

    await stopContainer(task.containerId);

    updateTask(id, {
      status: 'failed',
      error: 'Stopped by user',
      completedAt: new Date().toISOString(),
    });

    const updatedTask = getTask(id);
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Failed to stop task:', error);
    return NextResponse.json(
      { error: 'Failed to stop task' },
      { status: 500 }
    );
  }
}
