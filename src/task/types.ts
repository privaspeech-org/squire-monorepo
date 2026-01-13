export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  repo: string;              // e.g., "carlulsoe/privaspeech" or full URL
  prompt: string;            // What to do
  branch?: string;           // Branch name (auto-generated if not provided)
  baseBranch?: string;       // Branch to base off (default: main)
  
  status: TaskStatus;
  containerId?: string;      // Docker container ID when running
  
  prUrl?: string;            // PR URL when created
  prNumber?: number;         // PR number
  prMerged?: boolean;        // PR was merged
  prMergedAt?: string;       // When PR was merged
  prClosed?: boolean;        // PR was closed (without merging)
  prClosedAt?: string;       // When PR was closed
  ciFailed?: boolean;        // CI check failed
  ciFailedAt?: string;       // When CI failed
  ciFailedCheck?: string;    // Name of failed check
  ciFixTaskId?: string;      // Follow-up task created to fix CI
  
  error?: string;            // Error message if failed
  
  createdAt: string;         // ISO timestamp
  startedAt?: string;        // When execution started
  completedAt?: string;      // When finished (success or fail)
  
  // For follow-ups
  parentTaskId?: string;     // If this is a follow-up, link to original
  followUpPrompts?: string[]; // Additional prompts added during execution
}

export interface TaskCreateOptions {
  repo: string;
  prompt: string;
  branch?: string;
  baseBranch?: string;
}

export interface TaskResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  logs?: string;
}

export interface WorkerConfig {
  githubToken: string;
  model?: string;            // OpenCode model to use
  opencodePath?: string;     // Path to OpenCode binary in container
}
