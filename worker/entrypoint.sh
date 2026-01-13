#!/bin/bash
set -e

# Jules Worker Entrypoint
# Executes a coding task using OpenCode

echo "=== Jules Worker Starting ==="
echo "Task ID: ${TASK_ID}"
echo "Repo: ${REPO}"
echo "Branch: ${BRANCH}"
echo "Base Branch: ${BASE_BRANCH}"
echo "Model: ${MODEL}"
echo ""

# Task file path (mounted from host)
TASK_FILE="/tasks/${TASK_ID}.json"

update_task() {
    local updates="$1"
    if [ -f "$TASK_FILE" ]; then
        jq ". + ${updates}" "$TASK_FILE" > "${TASK_FILE}.tmp" && mv "${TASK_FILE}.tmp" "$TASK_FILE"
    fi
}

# Configure git
git config --global user.name "Jules Bot"
git config --global user.email "jules@localhost"
git config --global init.defaultBranch main

# Configure git to use GITHUB_TOKEN for authentication
# Store credentials in a file that git can use
echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
git config --global credential.helper store

# GitHub CLI will use GITHUB_TOKEN environment variable automatically
gh auth status || true

# Parse repo (handle both "owner/repo" and full URLs)
if [[ "$REPO" == http* ]]; then
    REPO_URL="$REPO"
    REPO_NAME=$(echo "$REPO" | sed -E 's|https?://github.com/||' | sed 's|\.git$||')
else
    REPO_URL="https://github.com/${REPO}.git"
    REPO_NAME="$REPO"
fi

echo "=== Cloning ${REPO_NAME} ==="
gh repo clone "${REPO_NAME}" repo -- --depth=50
cd repo

# Auto-detect default branch if not specified or set to "auto"
if [ -z "${BASE_BRANCH}" ] || [ "${BASE_BRANCH}" = "auto" ]; then
    BASE_BRANCH=$(gh repo view "${REPO_NAME}" --json defaultBranchRef -q '.defaultBranchRef.name' 2>/dev/null || echo "main")
    echo "=== Auto-detected default branch: ${BASE_BRANCH} ==="
fi

# Fetch base branch and create working branch
echo "=== Setting up branch ${BRANCH} from ${BASE_BRANCH} ==="
git fetch origin "${BASE_BRANCH}"
git checkout -b "${BRANCH}" "origin/${BASE_BRANCH}"

echo "=== Running OpenCode ==="
echo "Model: ${MODEL}"
echo "Prompt: ${PROMPT}"
echo ""

# Build the full prompt with context
FULL_PROMPT="You are working on the repository ${REPO_NAME}.

## Task
${PROMPT}

## Instructions
1. Analyze the codebase to understand the structure
2. Implement the requested changes
3. Make sure the code compiles/runs without errors (run tests if available)
4. Write clean, idiomatic code following existing patterns
5. Commit your changes with a descriptive message

Stay focused on the task. Don't make unrelated changes."

# Run OpenCode with the task
# --model specifies the model to use
# The output will show what OpenCode is doing
if opencode run --model "${MODEL}" "${FULL_PROMPT}"; then
    echo "=== OpenCode completed successfully ==="
else
    echo "=== OpenCode failed ==="
    update_task '{"status": "failed", "error": "OpenCode execution failed", "completedAt": "'$(date -Iseconds)'"}'
    exit 1
fi

# Check if there are changes to push
# First, stage and commit any uncommitted changes
git add -A
COMMIT_MSG="jules: ${PROMPT:0:72}"
git commit -m "$COMMIT_MSG" 2>/dev/null || true

# Check if we have commits ahead of origin
COMMITS_AHEAD=$(git rev-list --count origin/${BASE_BRANCH}..HEAD 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD" = "0" ]; then
    echo "=== No changes to push ==="
    update_task '{"status": "failed", "error": "No changes were made", "completedAt": "'$(date -Iseconds)'"}'
    exit 1
fi

echo "=== ${COMMITS_AHEAD} commit(s) to push ==="

# Push branch
echo "=== Pushing branch ${BRANCH} ==="
git push -u origin "${BRANCH}"

# Create PR
echo "=== Creating Pull Request ==="
PR_TITLE="[Jules] ${PROMPT:0:100}"
PR_BODY="## Task

${PROMPT}

---
*Automated by Jules (task: ${TASK_ID})*"

PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base "${BASE_BRANCH}" --head "${BRANCH}" 2>&1) || PR_URL=$(gh pr view --json url -q .url 2>/dev/null || echo "PR creation failed")
PR_NUMBER=$(echo "$PR_URL" | grep -oE '/pull/[0-9]+' | grep -oE '[0-9]+' || echo "")

echo "=== PR Created: ${PR_URL} ==="

# Update task with success
if [ -n "$PR_NUMBER" ]; then
    update_task "{\"status\": \"completed\", \"prUrl\": \"${PR_URL}\", \"prNumber\": ${PR_NUMBER}, \"completedAt\": \"$(date -Iseconds)\"}"
else
    update_task "{\"status\": \"completed\", \"prUrl\": \"${PR_URL}\", \"completedAt\": \"$(date -Iseconds)\"}"
fi

echo "=== Jules Worker Complete ==="
