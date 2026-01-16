import { z } from 'zod';

/**
 * Schema for GitHub webhook pull_request events
 */
export const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string().url(),
    number: z.number(),
    merged: z.boolean().optional(),
    state: z.string().optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }).optional(),
});

/**
 * Schema for GitHub webhook issue_comment events
 */
export const issueCommentEventSchema = z.object({
  action: z.string(),
  issue: z.object({
    html_url: z.string().url(),
    number: z.number(),
    pull_request: z.object({}).optional(), // Presence indicates this is a PR comment
  }),
  comment: z.object({
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
  }),
});

/**
 * Schema for GitHub webhook pull_request_review events
 */
export const pullRequestReviewEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string().url(),
    number: z.number(),
  }),
  review: z.object({
    user: z.object({
      login: z.string(),
    }),
    body: z.string().optional(),
    state: z.string(),
  }),
});

/**
 * Schema for GitHub webhook pull_request_review_comment events
 */
export const pullRequestReviewCommentEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string().url(),
    number: z.number(),
  }),
  comment: z.object({
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
    path: z.string().optional(),
    line: z.number().optional(),
    original_line: z.number().optional(),
  }),
});

/**
 * Schema for GitHub webhook check_run events
 */
export const checkRunEventSchema = z.object({
  action: z.string(),
  check_run: z.object({
    name: z.string(),
    conclusion: z.string().optional(),
    output: z.object({
      summary: z.string().optional(),
      text: z.string().optional(),
    }).optional(),
    pull_requests: z.array(z.object({
      number: z.number(),
    })).optional(),
  }),
  repository: z.object({
    full_name: z.string(),
  }),
});

/**
 * Map of event types to their validation schemas
 */
export const webhookSchemas = {
  pull_request: pullRequestEventSchema,
  issue_comment: issueCommentEventSchema,
  pull_request_review: pullRequestReviewEventSchema,
  pull_request_review_comment: pullRequestReviewCommentEventSchema,
  check_run: checkRunEventSchema,
} as const;

export type WebhookEventType = keyof typeof webhookSchemas;

/**
 * Validate a webhook payload against its schema
 */
export function validateWebhookPayload(
  event: string,
  payload: unknown
): { valid: true; data: unknown } | { valid: false; error: string } {
  const schema = webhookSchemas[event as WebhookEventType];

  if (!schema) {
    // Unknown event type - allow it through (we may not handle all events)
    return { valid: true, data: payload };
  }

  try {
    const validated = schema.parse(payload);
    return { valid: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        error: `Schema validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }
    return { valid: false, error: 'Unknown validation error' };
  }
}
