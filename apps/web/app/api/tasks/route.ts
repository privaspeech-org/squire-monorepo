import { NextResponse } from 'next/server';
import { listTasks, createTask, countRunningTasks } from '@squire/core';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'running' | 'completed' | 'failed' | null;

    // Sync running task statuses with container states before listing
    // This handles cases where background monitoring was lost (e.g., server restart)
    await countRunningTasks();

    const tasks = listTasks(status || undefined);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Failed to list tasks:', error);
    return NextResponse.json(
      { error: 'Failed to list tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repo, prompt, branch, baseBranch } = body;

    if (!repo || !prompt) {
      return NextResponse.json(
        { error: 'repo and prompt are required' },
        { status: 400 }
      );
    }

    const task = createTask({
      repo,
      prompt,
      branch,
      baseBranch,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
