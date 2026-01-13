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

# Configure GitHub CLI
echo "${GITHUB_TOKEN}" | gh auth login --with-token

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

# Fetch base branch and create working branch
echo "=== Setting up branch ${BRANCH} from ${BASE_BRANCH} ==="
git fetch origin "${BASE_BRANCH}"
git checkout -b "${BRANCH}" "origin/${BASE_BRANCH}"

# Configure OpenCode
export OPENCODE_MODEL="${MODEL}"
export OPENCODE_AUTO_APPROVE=true

# Create the prompt file
cat > /tmp/task-prompt.md << PROMPT_EOF
# Task

${PROMPT}

## Instructions

1. Analyze the codebase to understand the structure
2. Implement the requested changes
3. Make sure the code compiles/runs without errors
4. Write clean, idiomatic code following existing patterns
5. When done, commit your changes with a descriptive message

## Important

- Stay focused on the task
- Don't make unrelated changes
- If you encounter blockers, document them clearly
PROMPT_EOF

echo "=== Running OpenCode ==="
echo "Prompt: ${PROMPT}"
echo ""

# Run OpenCode with the task
# The --yes flag auto-approves file changes
if opencode run --prompt-file /tmp/task-prompt.md --yes; then
    echo "=== OpenCode completed successfully ==="
else
    echo "=== OpenCode failed ==="
    update_task '{"status": "failed", "error": "OpenCode execution failed", "completedAt": "'$(date -Iseconds)'"}'
    exit 1
fi

# Check if there are changes to commit
if git diff --quiet && git diff --staged --quiet; then
    echo "=== No changes made ==="
    update_task '{"status": "failed", "error": "No changes were made", "completedAt": "'$(date -Iseconds)'"}'
    exit 1
fi

# Stage all changes
git add -A

# Commit
COMMIT_MSG="Jules: ${PROMPT:0:72}"
git commit -m "$COMMIT_MSG" || true

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

PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base "${BASE_BRANCH}" --head "${BRANCH}" 2>&1)
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$' || echo "")

echo "=== PR Created: ${PR_URL} ==="

# Update task with success
update_task "{\"status\": \"completed\", \"prUrl\": \"${PR_URL}\", \"prNumber\": ${PR_NUMBER:-null}, \"completedAt\": \"$(date -Iseconds)\"}"

echo "=== Jules Worker Complete ==="
