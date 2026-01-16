import { NextResponse } from 'next/server';
import { getTask, updateTask, startTaskContainer } from '@squire/core';

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

    if (task.status !== 'pending' && task.status !== 'failed') {
      return NextResponse.json(
        { error: 'Task is not in a startable state' },
        { status: 400 }
      );
    }

    // Update task status
    await updateTask(id, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    // Get GitHub token from environment
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

    // Start container in background
    startTaskContainer({
      task,
      githubToken,
    }).catch(async (error) => {
      console.error('Container start failed:', error);
      await updateTask(id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString(),
      });
    });

    const updatedTask = getTask(id);
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Failed to start task:', error);
    return NextResponse.json(
      { error: 'Failed to start task' },
      { status: 500 }
    );
  }
}
