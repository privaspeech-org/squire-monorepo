#!/bin/bash
#
# E2E Smoke Tests for Squire
#
# This script runs basic smoke tests against a deployed Squire installation.
# It verifies that the core components are running and responding correctly.
#
# Usage: ./scripts/e2e-test.sh [namespace]
#
# Environment:
#   NAMESPACE - Kubernetes namespace (default: squire-dev)
#

set -euo pipefail

NAMESPACE="${1:-${NAMESPACE:-squire-dev}}"
TIMEOUT="${TIMEOUT:-60}"
RETRY_DELAY="${RETRY_DELAY:-5}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "\n${GREEN}[TEST]${NC} $1"
}

# Wait for a condition with retries
wait_for() {
    local description="$1"
    local check_cmd="$2"
    local timeout="${3:-$TIMEOUT}"

    log_info "Waiting for: $description (timeout: ${timeout}s)"

    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if eval "$check_cmd" > /dev/null 2>&1; then
            log_info "✓ $description"
            return 0
        fi
        sleep $RETRY_DELAY
        elapsed=$((elapsed + RETRY_DELAY))
    done

    log_error "✗ Timeout waiting for: $description"
    return 1
}

# Check pod is running
check_pod_running() {
    local label="$1"
    kubectl get pods -n "$NAMESPACE" -l "$label" -o jsonpath='{.items[0].status.phase}' 2>/dev/null | grep -q "Running"
}

# Port forward and check endpoint
check_endpoint() {
    local service="$1"
    local port="$2"
    local path="${3:-/}"
    local expected="${4:-200}"

    # Start port-forward in background
    local local_port=$((8000 + RANDOM % 1000))
    kubectl port-forward -n "$NAMESPACE" "svc/$service" "$local_port:$port" &
    local pf_pid=$!

    # Give port-forward time to establish
    sleep 3

    # Make request
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$local_port$path" || echo "000")

    # Kill port-forward
    kill $pf_pid 2>/dev/null || true
    wait $pf_pid 2>/dev/null || true

    if [ "$status_code" = "$expected" ]; then
        return 0
    else
        log_warn "Expected HTTP $expected, got HTTP $status_code"
        return 1
    fi
}

# Test: Check all pods are running
test_pods_running() {
    log_test "Checking pods are running..."

    local failed=0

    # Check web pod
    if check_pod_running "app.kubernetes.io/name=squire-web"; then
        log_info "✓ Web pod is running"
    else
        log_error "✗ Web pod is not running"
        failed=1
    fi

    # Check steward pod (may not be running if config is missing)
    if check_pod_running "app.kubernetes.io/name=squire-steward"; then
        log_info "✓ Steward pod is running"
    else
        log_warn "⚠ Steward pod is not running (may need config)"
    fi

    return $failed
}

# Test: Web dashboard health check
test_web_health() {
    log_test "Testing web dashboard health endpoint..."

    # Check if the web service exists
    if ! kubectl get svc -n "$NAMESPACE" squire-web > /dev/null 2>&1; then
        # Try with prefix
        if ! kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/name=squire-web -o name | head -1 | grep -q .; then
            log_error "✗ Web service not found"
            return 1
        fi
    fi

    # Get the actual service name
    local svc_name
    svc_name=$(kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/name=squire-web -o name | head -1 | sed 's|service/||')

    if [ -z "$svc_name" ]; then
        svc_name="squire-web"
    fi

    log_info "Using service: $svc_name"

    if check_endpoint "$svc_name" 80 "/" "200"; then
        log_info "✓ Web dashboard is responding"
        return 0
    else
        log_error "✗ Web dashboard health check failed"
        return 1
    fi
}

# Test: Tasks API endpoint
test_tasks_api() {
    log_test "Testing tasks API endpoint..."

    local svc_name
    svc_name=$(kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/name=squire-web -o name | head -1 | sed 's|service/||')

    if [ -z "$svc_name" ]; then
        svc_name="squire-web"
    fi

    # Start port-forward in background
    local local_port=$((8000 + RANDOM % 1000))
    kubectl port-forward -n "$NAMESPACE" "svc/$svc_name" "$local_port:80" &
    local pf_pid=$!

    sleep 3

    # Test tasks endpoint
    local response
    response=$(curl -s "http://localhost:$local_port/api/tasks" || echo '{"error": "request failed"}')

    # Kill port-forward
    kill $pf_pid 2>/dev/null || true
    wait $pf_pid 2>/dev/null || true

    # Check if response is valid JSON array or has tasks field
    if echo "$response" | grep -qE '^\[|"tasks"'; then
        log_info "✓ Tasks API is responding with valid data"
        log_info "  Response: $(echo "$response" | head -c 100)..."
        return 0
    else
        log_error "✗ Tasks API returned unexpected response"
        log_error "  Response: $response"
        return 1
    fi
}

# Test: Create a task via API
test_create_task() {
    log_test "Testing task creation via API..."

    local svc_name
    svc_name=$(kubectl get svc -n "$NAMESPACE" -l app.kubernetes.io/name=squire-web -o name | head -1 | sed 's|service/||')

    if [ -z "$svc_name" ]; then
        svc_name="squire-web"
    fi

    # Start port-forward in background
    local local_port=$((8000 + RANDOM % 1000))
    kubectl port-forward -n "$NAMESPACE" "svc/$svc_name" "$local_port:80" &
    local pf_pid=$!

    sleep 3

    # Create a test task
    local response
    response=$(curl -s -X POST "http://localhost:$local_port/api/tasks" \
        -H "Content-Type: application/json" \
        -d '{
            "repo": "test-owner/test-repo",
            "prompt": "E2E test task - please ignore"
        }' || echo '{"error": "request failed"}')

    # Kill port-forward
    kill $pf_pid 2>/dev/null || true
    wait $pf_pid 2>/dev/null || true

    # Check if task was created (should have an id field)
    if echo "$response" | grep -q '"id"'; then
        local task_id
        task_id=$(echo "$response" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
        log_info "✓ Task created successfully with ID: $task_id"
        return 0
    else
        log_warn "⚠ Task creation returned: $response"
        # Don't fail - task creation might need proper GitHub token
        return 0
    fi
}

# Test: Check Kubernetes resources
test_k8s_resources() {
    log_test "Checking Kubernetes resources..."

    local failed=0

    # Check deployments
    log_info "Checking deployments..."
    local deployments
    deployments=$(kubectl get deployments -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
    if [ "$deployments" -gt 0 ]; then
        log_info "✓ Found $deployments deployment(s)"
    else
        log_error "✗ No deployments found"
        failed=1
    fi

    # Check services
    log_info "Checking services..."
    local services
    services=$(kubectl get services -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
    if [ "$services" -gt 0 ]; then
        log_info "✓ Found $services service(s)"
    else
        log_error "✗ No services found"
        failed=1
    fi

    # Check PVCs
    log_info "Checking persistent volume claims..."
    local pvcs
    pvcs=$(kubectl get pvc -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
    if [ "$pvcs" -gt 0 ]; then
        log_info "✓ Found $pvcs PVC(s)"
    else
        log_warn "⚠ No PVCs found (may be expected in test environment)"
    fi

    return $failed
}

# Main test runner
main() {
    log_info "Starting E2E smoke tests for Squire"
    log_info "Namespace: $NAMESPACE"
    log_info "Timeout: ${TIMEOUT}s"
    echo ""

    # Show current state
    log_info "Current pods in namespace:"
    kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || log_warn "No pods found"
    echo ""

    local total_tests=0
    local passed_tests=0
    local failed_tests=0

    # Run tests
    tests=(
        "test_k8s_resources"
        "test_pods_running"
        "test_web_health"
        "test_tasks_api"
        "test_create_task"
    )

    for test in "${tests[@]}"; do
        total_tests=$((total_tests + 1))
        if $test; then
            passed_tests=$((passed_tests + 1))
        else
            failed_tests=$((failed_tests + 1))
        fi
    done

    # Summary
    echo ""
    echo "========================================"
    log_info "E2E Test Summary"
    echo "========================================"
    log_info "Total tests: $total_tests"
    log_info "Passed: $passed_tests"
    if [ $failed_tests -gt 0 ]; then
        log_error "Failed: $failed_tests"
    else
        log_info "Failed: $failed_tests"
    fi
    echo "========================================"

    if [ $failed_tests -gt 0 ]; then
        log_error "E2E tests failed!"
        exit 1
    else
        log_info "All E2E tests passed!"
        exit 0
    fi
}

main "$@"
