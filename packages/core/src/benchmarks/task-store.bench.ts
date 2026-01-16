/**
 * Performance benchmarks for task store operations
 *
 * Run with: node --import tsx packages/core/src/benchmarks/task-store.bench.ts
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  setTasksDir,
  getTasksDir,
} from '../task/store.js';

interface BenchmarkResult {
  name: string;
  operations: number;
  duration: number;
  opsPerSecond: number;
  averageMs: number;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(2)}ms`;
}

function benchmark(name: string, operations: number, fn: () => void | Promise<void>): Promise<BenchmarkResult> {
  return new Promise(async (resolve) => {
    const start = performance.now();

    if (fn.constructor.name === 'AsyncFunction') {
      await fn();
    } else {
      fn();
    }

    const end = performance.now();
    const duration = end - start;
    const opsPerSecond = (operations / duration) * 1000;
    const averageMs = duration / operations;

    resolve({
      name,
      operations,
      duration,
      opsPerSecond,
      averageMs,
    });
  });
}

function printResults(results: BenchmarkResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log();

  // Find max lengths for alignment
  const maxNameLength = Math.max(...results.map(r => r.name.length));

  // Print header
  console.log(
    'Benchmark'.padEnd(maxNameLength + 2) +
    'Operations'.padStart(12) +
    'Duration'.padStart(12) +
    'Ops/sec'.padStart(12) +
    'Avg/op'.padStart(12)
  );
  console.log('-'.repeat(80));

  // Print results
  for (const result of results) {
    console.log(
      result.name.padEnd(maxNameLength + 2) +
      result.operations.toString().padStart(12) +
      formatDuration(result.duration).padStart(12) +
      formatNumber(result.opsPerSecond).padStart(12) +
      formatDuration(result.averageMs).padStart(12)
    );
  }

  console.log('='.repeat(80));
  console.log();
}

async function runBenchmarks() {
  console.log('Starting performance benchmarks...\n');

  const results: BenchmarkResult[] = [];
  let tempDir: string;
  let originalTasksDir: string;

  // Setup
  originalTasksDir = getTasksDir();
  tempDir = mkdtempSync(join(tmpdir(), 'squire-bench-'));
  setTasksDir(tempDir);

  try {
    // Benchmark 1: Task creation throughput
    console.log('Benchmarking task creation...');
    const createCount = 1000;
    results.push(await benchmark('Create tasks', createCount, () => {
      for (let i = 0; i < createCount; i++) {
        createTask({
          repo: `owner/repo${i}`,
          prompt: `Task ${i}: Fix the bug in module ${i}`,
        });
      }
    }));

    // Benchmark 2: List all tasks
    console.log('Benchmarking list tasks...');
    const listCount = 100;
    results.push(await benchmark('List all tasks', listCount, () => {
      for (let i = 0; i < listCount; i++) {
        listTasks();
      }
    }));

    // Benchmark 3: Get single task by ID
    console.log('Benchmarking get task...');
    const firstTask = listTasks()[0];
    const getCount = 1000;
    results.push(await benchmark('Get task by ID', getCount, () => {
      for (let i = 0; i < getCount; i++) {
        getTask(firstTask.id);
      }
    }));

    // Benchmark 4: Update task
    console.log('Benchmarking task updates...');
    const updateCount = 500;
    results.push(await benchmark('Update tasks', updateCount, async () => {
      const tasks = listTasks().slice(0, updateCount);
      for (let i = 0; i < tasks.length; i++) {
        await updateTask(tasks[i].id, { status: 'running' });
      }
    }));

    // Benchmark 5: List filtered tasks
    console.log('Benchmarking filtered list...');
    const filterCount = 100;
    results.push(await benchmark('List filtered tasks', filterCount, () => {
      for (let i = 0; i < filterCount; i++) {
        listTasks('running');
      }
    }));

    // Benchmark 6: Delete tasks
    console.log('Benchmarking task deletion...');
    const deleteCount = 500;
    results.push(await benchmark('Delete tasks', deleteCount, async () => {
      const tasks = listTasks().slice(0, deleteCount);
      for (let i = 0; i < tasks.length; i++) {
        await deleteTask(tasks[i].id);
      }
    }));

    // Benchmark 7: Large dataset - Create 10K tasks
    console.log('Benchmarking large dataset (10K tasks)...');
    // Clean up first
    const remainingTasks = listTasks();
    for (const task of remainingTasks) {
      await deleteTask(task.id);
    }

    const largeCount = 10000;
    results.push(await benchmark('Create 10K tasks', largeCount, () => {
      for (let i = 0; i < largeCount; i++) {
        createTask({
          repo: `owner/repo${i}`,
          prompt: `Task ${i}: Fix the bug`,
        });
      }
    }));

    // Benchmark 8: List performance with 10K tasks
    console.log('Benchmarking list with 10K tasks...');
    const largeListCount = 100;
    results.push(await benchmark('List 10K tasks', largeListCount, () => {
      for (let i = 0; i < largeListCount; i++) {
        listTasks();
      }
    }));

    // Print all results
    printResults(results);

    // Print performance targets and actual results
    console.log('\nPERFORMANCE TARGETS vs ACTUAL:');
    console.log('-'.repeat(80));

    const listAll = results.find(r => r.name === 'List all tasks');
    const list10k = results.find(r => r.name === 'List 10K tasks');

    if (listAll) {
      console.log(`✓ List 1K tasks:  ${formatDuration(listAll.averageMs)} (target: <100ms)`);
      console.log(`  ${listAll.averageMs < 100 ? '✅ PASS' : '❌ NEEDS OPTIMIZATION'}`);
    }

    if (list10k) {
      console.log(`\n✓ List 10K tasks: ${formatDuration(list10k.averageMs)} (target: <500ms)`);
      console.log(`  ${list10k.averageMs < 500 ? '✅ PASS' : '❌ NEEDS OPTIMIZATION'}`);
    }

    const taskCount = listTasks().length;
    console.log(`\n📊 Final task count: ${taskCount.toLocaleString()}`);
    console.log('-'.repeat(80));

  } finally {
    // Cleanup
    setTasksDir(originalTasksDir);
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  }
}

// Run benchmarks
runBenchmarks().catch((error) => {
  console.error('Benchmark error:', error);
  process.exit(1);
});
