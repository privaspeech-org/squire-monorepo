import { NextResponse } from 'next/server';
import { listTasks, getBackend } from '@squire/core';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    taskStore: CheckResult;
    backend: CheckResult;
  };
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  durationMs?: number;
}

const startTime = Date.now();

async function checkTaskStore(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const tasks = listTasks();
    return {
      status: 'pass',
      message: `${tasks.length} tasks in store`,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - start,
    };
  }
}

async function checkBackend(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const backend = await getBackend();
    const tasks = await backend.listTasks();
    return {
      status: 'pass',
      message: `Backend: ${backend.name}, ${tasks.length} workers`,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'warn',
      message: error instanceof Error ? error.message : 'Backend unavailable',
      durationMs: Date.now() - start,
    };
  }
}

export async function GET() {
  try {
    const [taskStoreCheck, backendCheck] = await Promise.all([
      checkTaskStore(),
      checkBackend(),
    ]);

    const checks = {
      taskStore: taskStoreCheck,
      backend: backendCheck,
    };

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (taskStoreCheck.status === 'fail') {
      status = 'unhealthy';
    } else if (backendCheck.status === 'fail') {
      status = 'degraded';
    } else if (backendCheck.status === 'warn') {
      status = 'degraded';
    }

    const health: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    };

    const httpStatus = status === 'unhealthy' ? 503 : 200;
    return NextResponse.json(health, { status: httpStatus });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
