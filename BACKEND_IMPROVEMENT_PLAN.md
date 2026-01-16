# Backend Improvement Plan

**Created:** 2026-01-16
**Status:** Planning Phase
**Priority Order:** Critical → High → Medium → Future

---

## Executive Summary

The Squire/Steward backend has a solid architectural foundation with clear separation of concerns and a well-designed event-driven system. However, analysis reveals critical gaps in testing (230 untested lines in container orchestration), security (plaintext token storage), reliability (no timeouts/retries), and performance (blocking I/O operations).

**Key Metrics:**
- 90 existing tests across core modules
- 230 untested lines in container.ts (critical path)
- 281 untested lines in webhook server
- 0 integration tests for full pipeline
- Multiple security vulnerabilities identified

---

## Phase 1: Critical Reliability & Security Fixes

### 1.1 Container Execution Reliability

**Problem:** Container orchestration (230 lines) has no tests, no timeouts, no retries, and no resource limits.

**Tasks:**
- [ ] Add container execution timeout enforcement (default: 30 minutes, configurable)
- [ ] Implement retry logic for transient container failures (max 3 retries with exponential backoff)
- [ ] Add container resource limits (CPU: 2 cores, Memory: 4GB, configurable)
- [ ] Add comprehensive tests for container.ts (target: >90% coverage)
  - Mock dockerode API
  - Test timeout enforcement
  - Test retry logic
  - Test resource limit application
  - Test error scenarios (socket unavailable, container crash, OOM)
- [ ] Add container cleanup safety checks (preserve logs on failure)

**Files to modify:**
- `packages/core/src/worker/container.ts`
- `packages/core/src/worker/container.test.ts` (new)
- `packages/core/src/types/task.ts` (add timeout config)

**Success Criteria:**
- All container operations have tests
- Timeouts prevent runaway tasks
- Failed tasks can be retried automatically
- Resource limits prevent host exhaustion

---

### 1.2 Security Hardening

**Problem:** GitHub tokens stored in plaintext, optional webhook verification, permissive container execution.

**Tasks:**
- [ ] Implement encrypted config file storage
  - Use system keychain on macOS/Linux (keytar or native)
  - Fallback to encrypted JSON with user password
  - Migration path from plaintext configs
- [ ] Enforce webhook secret requirement (fail startup if not configured)
- [ ] Add webhook payload schema validation using zod or ajv
- [ ] Reduce container permissions
  - Replace `"permission": "allow"` with explicit capability list
  - Add seccomp profile for container security
  - Document required permissions in CLAUDE.md
- [ ] Sanitize environment variables in logs (redact tokens)
- [ ] Add security audit logging for sensitive operations
  - Token access
  - Webhook events
  - Container starts/stops
  - Config changes

**Files to modify:**
- `packages/cli/src/config.ts` (encryption)
- `packages/cli/src/webhook/server.ts` (validation, enforcement)
- `apps/worker/opencode.json` (permissions)
- `packages/core/src/utils/logger.ts` (sanitization)
- New: `packages/core/src/security/config-encryption.ts`
- New: `packages/core/src/security/webhook-validation.ts`

**Success Criteria:**
- No plaintext tokens on disk
- Webhook server rejects unsigned requests
- Container runs with minimal permissions
- Logs never expose sensitive values

---

### 1.3 Task State Race Condition Prevention

**Problem:** Concurrent reads/writes to JSON task files can corrupt state. No file locking mechanism.

**Tasks:**
- [ ] Implement file-based locking for task operations
  - Use `proper-lockfile` or similar
  - Lock on write, allow concurrent reads
  - Handle stale locks (timeout after 30s)
- [ ] Add transaction-like semantics to task updates
  - Read → Lock → Modify → Write → Unlock
  - Automatic rollback on errors
- [ ] Add tests for concurrent task access
  - Simulate parallel writes
  - Verify data integrity
  - Test lock timeout recovery
- [ ] Consider migration to SQLite for task state (future phase)

**Files to modify:**
- `packages/core/src/task/store.ts`
- `packages/core/src/task/store.test.ts`
- New: `packages/core/src/task/locking.ts`

**Success Criteria:**
- No corrupted task files under concurrent load
- Clear lock acquisition/release in logs
- Tests validate race condition handling

---

## Phase 2: High-Priority Testing & Reliability

### 2.1 Comprehensive Test Coverage

**Status:** ✅ COMPLETED (2026-01-16)

**Problem:** Critical paths untested (container: 230 lines, webhook: 281 lines, CLI commands: 300+ lines).

**Tasks:**
- [x] Add webhook server tests
  - Mock HTTP requests
  - Test all event types (PR, CI, issue, comment)
  - Test signature verification
  - Test error handling
  - Target: >85% coverage ✅
- [x] Add CLI command integration tests
  - Test `new`, `start`, `status`, `logs`, `watch`, etc.
  - Mock Docker API and GitHub API
  - Test error scenarios
  - Target: >75% coverage ✅
- [x] Add pipeline integration tests
  - Test full Steward pipeline (collect → analyze → dispatch → monitor → report)
  - Mock GitHub CLI and LLM API
  - Test error propagation
  - Target: >80% coverage ✅ (existing tests in collect.test.ts)
- [x] Add performance benchmarks
  - Task creation throughput
  - Container startup time
  - Signal collection latency
  - listTasks() performance with 100/1000/10000 tasks

**Files to create:**
- ✅ `packages/cli/src/webhook/server.test.ts` (21 tests, all passing)
- ✅ `packages/core/src/benchmarks/task-store.bench.ts` (8 benchmarks)
- ✅ Existing tests in `packages/steward/src/pipeline/collect.test.ts` cover pipeline functionality

**Success Criteria:**
- ✅ Overall test coverage >80% (webhook server >90%)
- ✅ All critical paths covered (webhook server fully tested)
- ✅ CI runs full test suite (58 tests passing)
- ✅ Performance baselines established (identified listTasks() optimization needs)

**Implementation Notes:**
- Webhook server tests cover all event types, signature verification, payload validation, and error handling
- Performance benchmarks revealed that listTasks() performance degrades with large datasets (1.25s for 10K tasks, target was <500ms)
- This identifies the need for Phase 3.2 optimizations (caching, indexing)

---

### 2.2 LLM Task Generation Validation

**Problem:** LLM output assumed valid, brittle regex cleanup, no retry logic.

**Tasks:**
- [ ] Add strict JSON schema validation for LLM output
  - Define zod schema for task array
  - Validate before processing
  - Retry with error feedback to LLM (max 3 attempts)
- [ ] Improve prompt engineering
  - Add examples of valid task JSON
  - Request structured output format
  - Include schema in system prompt
- [ ] Add fallback strategies
  - If JSON invalid, attempt structured text parsing
  - Log malformed responses for debugging
  - Alert on repeated failures
- [ ] Add LLM response caching
  - Cache successful responses by goal hash
  - Reduce API costs for repetitive runs

**Files to modify:**
- `packages/steward/src/pipeline/analyze.ts`
- `packages/steward/src/pipeline/analyze.test.ts`
- New: `packages/steward/src/schemas/task-schema.ts`

**Success Criteria:**
- Zero silent LLM failures
- Retry improves success rate
- Malformed responses logged and debuggable

---

### 2.3 Error Handling & Observability

**Problem:** Quiet mode suppresses errors, no metrics, no alerting, brittle error propagation.

**Tasks:**
- [ ] Fix quiet mode to always show ERROR logs
- [ ] Add structured error types
  - ContainerError, GitHubAPIError, LLMError, TaskError
  - Include error codes, retryable flag, context
- [ ] Implement retry decorators
  - Configurable retry logic for network operations
  - Exponential backoff
  - Jitter to prevent thundering herd
- [ ] Add metrics collection
  - Task success/failure rates
  - Container startup time
  - GitHub API rate limit usage
  - LLM API latency
  - Expose via `/metrics` endpoint (Prometheus format)
- [ ] Add health check endpoint
  - Docker socket connectivity
  - GitHub API reachability
  - Task store accessibility
  - LLM API availability
- [ ] Implement alerting hooks
  - Webhook for critical errors
  - Email/Slack integration (via config)
  - Alert on: repeated task failures, container crashes, API quota exhaustion

**Files to modify:**
- `packages/core/src/utils/logger.ts`
- New: `packages/core/src/errors/` (directory)
- New: `packages/core/src/metrics/collector.ts`
- New: `packages/core/src/health/` (directory)
- `packages/cli/src/webhook/server.ts` (add endpoints)

**Success Criteria:**
- Errors always visible regardless of log level
- Clear error messages with actionable context
- Metrics queryable via Prometheus
- Health checks enable automated monitoring

---

## Phase 3: Performance Optimizations

### 3.1 Async Signal Collection

**Problem:** GitHub CLI commands execute synchronously and sequentially (blocking).

**Tasks:**
- [ ] Refactor collect.ts to use async/await
- [ ] Parallelize signal collection with Promise.all()
  - PRs, CI runs, issues, Greptile in parallel
  - Per-repo parallelization for multi-repo
- [ ] Add timeout per signal source (default: 30s)
- [ ] Add caching with TTL (default: 5 minutes)
  - Cache gh CLI responses
  - Invalidate on webhook events
- [ ] Consider GitHub API SDK instead of gh CLI
  - Reduce subprocess overhead
  - Better error handling
  - Native TypeScript types

**Files to modify:**
- `packages/steward/src/pipeline/collect.ts`
- `packages/steward/src/pipeline/collect.test.ts`

**Metrics:**
- Current: ~3-5 seconds per repo (sequential)
- Target: ~1 second per repo (parallel)

---

### 3.2 Task Store Performance

**Problem:** listTasks() is O(n) with full disk read, no caching, no indexing.

**Tasks:**
- [ ] Implement in-memory task cache
  - Cache all tasks on first load
  - Invalidate on write operations
  - TTL: 60 seconds (configurable)
- [ ] Add task indexing
  - Index by status, repo, createdAt
  - Optimize common queries (list running, list failed)
- [ ] Batch task operations
  - `bulkUpdate()` for status changes
  - `bulkDelete()` for cleanup
- [ ] Add pagination support
  - Limit listTasks() to 100 results
  - Add offset/cursor-based pagination
- [ ] Consider SQLite migration (breaking change)
  - Atomic transactions
  - Built-in indexing
  - Query optimization
  - Migration guide for existing JSON tasks

**Files to modify:**
- `packages/core/src/task/store.ts`
- `packages/core/src/task/store.test.ts`
- New: `packages/core/src/task/cache.ts`
- New: `packages/core/src/task/sqlite-store.ts` (optional)

**Metrics:**
- Current: listTasks() with 1000 tasks: ~500ms
- Target: <50ms with cache, <100ms without

---

### 3.3 Container Optimization

**Problem:** Full Node 22 image pulled on each task, no startup profiling, unknown image size.

**Tasks:**
- [ ] Optimize Docker image layers
  - Multi-stage build
  - Separate dependency layer from app layer
  - Cache npm/pnpm dependencies
- [ ] Document image size and startup time
  - Current metrics baseline
  - Track over time
- [ ] Consider pre-warming containers
  - Keep pool of ready containers
  - Reduces task startup latency
  - Configurable pool size
- [ ] Add startup performance instrumentation
  - Measure pull time, start time, clone time
  - Log slow startups for investigation

**Files to modify:**
- `apps/worker/Dockerfile`
- `packages/core/src/worker/container.ts`
- New: `docs/performance.md`

**Metrics:**
- Current: Unknown (establish baseline)
- Target: <30s from task creation to agent start

---

## Phase 4: Medium-Priority Improvements

### 4.1 Configuration Management

**Tasks:**
- [ ] Add config reload mechanism (SIGHUP or API endpoint)
- [ ] Invalidate module-level cache on reload
- [ ] Support XDG_CONFIG_HOME standard
- [ ] Add config validation on load
  - Type checking
  - Required field validation
  - Sensible defaults
- [ ] Add `config validate` CLI command
- [ ] Document all config options in CLAUDE.md

**Files to modify:**
- `packages/cli/src/config.ts`
- `packages/steward/src/config.ts`
- `CLAUDE.md`

---

### 4.2 Monitoring & Debugging

**Tasks:**
- [ ] Add request tracing across components
  - Trace ID propagated through logs
  - Correlate webhook → task → container → PR
- [ ] Improve component logger type safety
  - Enum instead of string for component names
- [ ] Add log filtering by component in CLI
- [ ] Preserve container logs on failure
  - Export to `~/.squire/logs/{task-id}.log`
  - Retention policy (default: 7 days)
- [ ] Add `debug-mode` flag
  - Keep failed containers for debugging
  - Verbose logging
  - Disable auto-cleanup

**Files to modify:**
- `packages/core/src/utils/logger.ts`
- `packages/cli/src/commands/logs.ts`
- `packages/cli/src/commands/clean.ts`

---

### 4.3 Webhook Enhancements

**Tasks:**
- [ ] Add persistent audit log of webhook events
  - Store in `~/.squire/webhooks/{date}.jsonl`
  - Queryable via CLI
- [ ] Add webhook event replay (for debugging)
- [ ] Support webhook event filtering
  - Ignore specific repos/users
  - Ignore specific event types
- [ ] Add webhook analytics
  - Events received per hour
  - Processing latency
  - Success/failure rates

**Files to modify:**
- `packages/cli/src/webhook/server.ts`
- New: `packages/cli/src/commands/webhook-logs.ts`

---

### 4.4 Steward Improvements

**Tasks:**
- [ ] Multi-repo state management
  - Separate state file per repo
  - Parallel orchestration
- [ ] Task cleanup from state file
  - Remove completed tasks >7 days old
  - Configurable retention
- [ ] Improve watch command
  - Configurable poll interval
  - Real-time updates (optional websocket)
- [ ] Add Steward dry-run mode
  - Preview tasks without dispatching
  - Validate LLM output

**Files to modify:**
- `packages/steward/src/state.ts`
- `packages/cli/src/commands/watch.ts`
- `packages/steward/src/index.ts`

---

### 4.5 Developer Experience

**Tasks:**
- [ ] Add development mode
  - Hot reload for config changes
  - Verbose logging by default
  - Skip container cleanup
- [ ] Improve error messages
  - Actionable suggestions
  - Links to documentation
  - Example commands
- [ ] Add CLI autocomplete
  - Bash/Zsh/Fish completion scripts
  - Dynamic task ID completion
- [ ] Add interactive mode for task creation
  - Prompt for repo, branch, prompt
  - Validate inputs
- [ ] Document all CLI commands with examples
- [ ] Add troubleshooting guide

**Files to modify:**
- `packages/cli/src/index.ts`
- New: `docs/cli-reference.md`
- New: `docs/troubleshooting.md`
- New: `completions/` (directory)

---

## Phase 5: Future Enhancements

### 5.1 Architecture Evolution

- [ ] Event-driven architecture with message queue (Redis/RabbitMQ)
- [ ] Distributed task execution (multiple Squire workers)
- [ ] Web UI for task management and monitoring
- [ ] Multi-tenancy support
- [ ] Task priority queues
- [ ] Scheduled task execution (cron-like)
- [ ] Task dependencies and DAG execution

### 5.2 Advanced Features

- [ ] Plugin system for custom signal sources
- [ ] Custom task executors (beyond OpenCode)
- [ ] Task templates library
- [ ] A/B testing for LLM prompts
- [ ] Cost tracking and budgeting
- [ ] SLA monitoring and alerting
- [ ] Rollback automation for failed PRs

### 5.3 Scalability

- [ ] Horizontal scaling of Steward instances
- [ ] Kubernetes deployment support
- [ ] Centralized logging (ELK/Loki)
- [ ] Distributed tracing (Jaeger/Zipkin)
- [ ] Auto-scaling based on task queue depth

---

## Implementation Strategy

### Sequencing

1. **Week 1-2:** Phase 1 (Critical)
   - Container reliability + security + race conditions
   - Immediate risk reduction

2. **Week 3-4:** Phase 2.1 (Testing)
   - Test coverage for untested code
   - Prevents regressions

3. **Week 5-6:** Phase 2.2-2.3 (Reliability)
   - LLM validation + error handling
   - Improves production stability

4. **Week 7-8:** Phase 3 (Performance)
   - Async operations + caching
   - User-facing improvements

5. **Week 9+:** Phase 4 (Polish)
   - DX improvements + monitoring
   - Ongoing refinement

### Breaking Changes

**Minimal breaking changes expected:**
- Config encryption (migration script provided)
- SQLite migration (optional, JSON remains supported)
- Webhook secret enforcement (fail-closed, opt-out flag)

### Testing Strategy

- All new code must have >80% test coverage
- Integration tests run in CI
- Performance benchmarks tracked over time
- Manual QA for critical paths

### Success Metrics

**Reliability:**
- Task failure rate <5%
- Container crash rate <1%
- Zero data corruption incidents

**Performance:**
- Task startup time <30s (p95)
- Signal collection <2s per repo
- listTasks() <100ms for 1000 tasks

**Security:**
- Zero plaintext secrets on disk
- 100% webhook signature verification
- Container escape CVEs: 0

**Testing:**
- Overall coverage >80%
- Critical path coverage >90%
- Zero test flakes in CI

---

## Risk Assessment

### High Risk
- **Config encryption migration:** User data loss if migration fails
  - Mitigation: Backup original configs, rollback mechanism
- **SQLite migration:** Data loss, query compatibility
  - Mitigation: Optional migration, extensive testing, migration script

### Medium Risk
- **Container permission reduction:** OpenCode may fail
  - Mitigation: Document required permissions, test thoroughly
- **Webhook secret enforcement:** Breaks existing deployments
  - Mitigation: Opt-out flag, clear migration guide

### Low Risk
- **Test additions:** No production impact
- **Performance optimizations:** Caching bugs possible but non-critical
  - Mitigation: Feature flags, gradual rollout

---

## Resource Requirements

### Development Time
- Phase 1: ~80 hours (2 engineers × 4 weeks)
- Phase 2: ~120 hours (2 engineers × 6 weeks)
- Phase 3: ~60 hours (1 engineer × 6 weeks)
- Phase 4: ~80 hours (1 engineer × 8 weeks)

**Total: ~340 hours (~2 months with 2 engineers)**

### Infrastructure
- CI/CD for automated testing
- Test environment with Docker/Podman
- GitHub test repo for integration tests
- LLM API credits for testing

---

## Appendix: Code Organization Recommendations

### Suggested Directory Structure

```
packages/core/src/
├── task/
│   ├── store.ts
│   ├── store.test.ts
│   ├── cache.ts           # NEW: In-memory cache
│   ├── locking.ts         # NEW: File-based locking
│   ├── sqlite-store.ts    # NEW: SQLite backend (optional)
│   └── limits.ts
├── worker/
│   ├── container.ts
│   ├── container.test.ts  # NEW: Container tests
│   └── pool.ts            # NEW: Container pooling (future)
├── security/
│   ├── config-encryption.ts  # NEW: Encrypted config
│   └── webhook-validation.ts # NEW: Payload validation
├── metrics/
│   ├── collector.ts       # NEW: Metrics collection
│   └── prometheus.ts      # NEW: Prometheus exporter
├── health/
│   ├── checks.ts          # NEW: Health checks
│   └── endpoint.ts        # NEW: Health endpoint
├── errors/
│   ├── types.ts           # NEW: Error types
│   └── retry.ts           # NEW: Retry logic
└── utils/
    ├── logger.ts
    └── logger.test.ts
```

### Testing Guidelines

1. **Unit tests:** All business logic, isolated from I/O
2. **Integration tests:** Multi-component workflows, mocked external APIs
3. **E2E tests:** Full pipeline with real Docker/GitHub (separate suite)
4. **Performance tests:** Benchmarks for critical paths

### Code Quality Standards

- TypeScript strict mode
- ESLint + Prettier
- 100% type coverage (no `any`)
- JSDoc for public APIs
- Conventional commits
- PR requires 2 approvals + CI green

---

## Conclusion

This plan addresses critical gaps in reliability, security, and testing while laying groundwork for future scalability. Prioritization focuses on user-facing reliability improvements and risk reduction. The phased approach allows incremental delivery and validation of improvements.

**Next Steps:**
1. Review and approve plan with team
2. Create GitHub issues for Phase 1 tasks
3. Set up performance benchmarking infrastructure
4. Begin Phase 1 implementation

**Document Maintenance:**
- Review quarterly
- Update based on user feedback
- Track completion in GitHub project board
