/**
 * Prometheus-style Metrics
 *
 * Provides simple metrics collection for observability.
 * Metrics are stored in memory and can be exported in Prometheus text format.
 */

export interface MetricLabels {
  [key: string]: string;
}

interface CounterValue {
  labels: MetricLabels;
  value: number;
}

interface GaugeValue {
  labels: MetricLabels;
  value: number;
}

interface HistogramValue {
  labels: MetricLabels;
  sum: number;
  count: number;
  buckets: Map<number, number>; // bucket upper bound -> count
}

interface MetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
}

// Default histogram buckets for duration metrics (in seconds)
const DEFAULT_DURATION_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600, 1800];

// Registry of all metrics
const metrics = new Map<string, MetricDefinition>();
const counters = new Map<string, CounterValue[]>();
const gauges = new Map<string, GaugeValue[]>();
const histograms = new Map<string, HistogramValue[]>();

/**
 * Generate a label string for metric lookup.
 */
function labelsToKey(labels: MetricLabels): string {
  const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([k, v]) => `${k}="${v}"`).join(',');
}

/**
 * Format labels for Prometheus output.
 */
function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

/**
 * Register a counter metric.
 */
export function registerCounter(name: string, help: string): void {
  if (!metrics.has(name)) {
    metrics.set(name, { name, help, type: 'counter' });
    counters.set(name, []);
  }
}

/**
 * Register a gauge metric.
 */
export function registerGauge(name: string, help: string): void {
  if (!metrics.has(name)) {
    metrics.set(name, { name, help, type: 'gauge' });
    gauges.set(name, []);
  }
}

/**
 * Register a histogram metric.
 */
export function registerHistogram(name: string, help: string): void {
  if (!metrics.has(name)) {
    metrics.set(name, { name, help, type: 'histogram' });
    histograms.set(name, []);
  }
}

/**
 * Increment a counter.
 */
export function incCounter(name: string, labels: MetricLabels = {}, value = 1): void {
  const values = counters.get(name);
  if (!values) {
    registerCounter(name, name);
    return incCounter(name, labels, value);
  }

  const key = labelsToKey(labels);
  let found = values.find(v => labelsToKey(v.labels) === key);

  if (!found) {
    found = { labels, value: 0 };
    values.push(found);
  }

  found.value += value;
}

/**
 * Set a gauge value.
 */
export function setGauge(name: string, value: number, labels: MetricLabels = {}): void {
  const values = gauges.get(name);
  if (!values) {
    registerGauge(name, name);
    return setGauge(name, value, labels);
  }

  const key = labelsToKey(labels);
  let found = values.find(v => labelsToKey(v.labels) === key);

  if (!found) {
    found = { labels, value: 0 };
    values.push(found);
  }

  found.value = value;
}

/**
 * Increment a gauge.
 */
export function incGauge(name: string, labels: MetricLabels = {}, value = 1): void {
  const values = gauges.get(name);
  if (!values) {
    registerGauge(name, name);
    return incGauge(name, labels, value);
  }

  const key = labelsToKey(labels);
  let found = values.find(v => labelsToKey(v.labels) === key);

  if (!found) {
    found = { labels, value: 0 };
    values.push(found);
  }

  found.value += value;
}

/**
 * Decrement a gauge.
 */
export function decGauge(name: string, labels: MetricLabels = {}, value = 1): void {
  incGauge(name, labels, -value);
}

/**
 * Observe a value in a histogram.
 */
export function observeHistogram(
  name: string,
  value: number,
  labels: MetricLabels = {},
  buckets: number[] = DEFAULT_DURATION_BUCKETS
): void {
  const values = histograms.get(name);
  if (!values) {
    registerHistogram(name, name);
    return observeHistogram(name, value, labels, buckets);
  }

  const key = labelsToKey(labels);
  let found = values.find(v => labelsToKey(v.labels) === key);

  if (!found) {
    const bucketMap = new Map<number, number>();
    buckets.forEach(b => bucketMap.set(b, 0));
    bucketMap.set(Infinity, 0);
    found = { labels, sum: 0, count: 0, buckets: bucketMap };
    values.push(found);
  }

  found.sum += value;
  found.count += 1;

  // Update bucket counts
  for (const [bound, count] of found.buckets) {
    if (value <= bound) {
      found.buckets.set(bound, count + 1);
    }
  }
}

/**
 * Get current value of a counter.
 */
export function getCounter(name: string, labels: MetricLabels = {}): number {
  const values = counters.get(name);
  if (!values) return 0;

  const key = labelsToKey(labels);
  const found = values.find(v => labelsToKey(v.labels) === key);
  return found?.value ?? 0;
}

/**
 * Get current value of a gauge.
 */
export function getGauge(name: string, labels: MetricLabels = {}): number {
  const values = gauges.get(name);
  if (!values) return 0;

  const key = labelsToKey(labels);
  const found = values.find(v => labelsToKey(v.labels) === key);
  return found?.value ?? 0;
}

/**
 * Export all metrics in Prometheus text format.
 */
export function exportMetrics(): string {
  const lines: string[] = [];

  // Export counters
  for (const [name, values] of counters) {
    const def = metrics.get(name);
    if (def) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} counter`);
    }
    for (const v of values) {
      lines.push(`${name}${formatLabels(v.labels)} ${v.value}`);
    }
  }

  // Export gauges
  for (const [name, values] of gauges) {
    const def = metrics.get(name);
    if (def) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} gauge`);
    }
    for (const v of values) {
      lines.push(`${name}${formatLabels(v.labels)} ${v.value}`);
    }
  }

  // Export histograms
  for (const [name, values] of histograms) {
    const def = metrics.get(name);
    if (def) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} histogram`);
    }
    for (const v of values) {
      const labelStr = formatLabels(v.labels);
      const baseLabels = Object.entries(v.labels);

      // Output buckets
      const sortedBuckets = [...v.buckets.entries()].sort(([a], [b]) => a - b);
      let cumulative = 0;
      for (const [bound, count] of sortedBuckets) {
        cumulative += count;
        const le = bound === Infinity ? '+Inf' : String(bound);
        const bucketLabels = [...baseLabels, ['le', le]];
        const bucketLabelStr = `{${bucketLabels.map(([k, vv]) => `${k}="${vv}"`).join(',')}}`;
        lines.push(`${name}_bucket${bucketLabelStr} ${cumulative}`);
      }

      // Output sum and count
      lines.push(`${name}_sum${labelStr} ${v.sum}`);
      lines.push(`${name}_count${labelStr} ${v.count}`);
    }
  }

  return lines.join('\n');
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
  metrics.clear();
}

// Pre-register Squire metrics
registerCounter('squire_tasks_created_total', 'Total number of tasks created');
registerCounter('squire_tasks_completed_total', 'Total number of tasks completed');
registerGauge('squire_tasks_running', 'Number of currently running tasks');
registerHistogram('squire_task_duration_seconds', 'Task execution duration in seconds');
registerCounter('squire_container_starts_total', 'Total number of container/job starts');
registerCounter('squire_api_requests_total', 'Total number of API requests');
registerHistogram('squire_api_request_duration_seconds', 'API request duration in seconds');
