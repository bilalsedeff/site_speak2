#!/bin/bash

# SiteSpeak Blue-Green Deployment Script
# This script orchestrates zero-downtime deployments using blue-green strategy

set -euo pipefail

# Configuration
NAMESPACE="sitespeak"
KUBECTL_TIMEOUT="300s"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi

    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace $NAMESPACE not found."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get current active deployment color
get_current_color() {
    local active_service=$(kubectl get service sitespeak-active-service -n "$NAMESPACE" -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo "blue")
    echo "$active_service"
}

# Get inactive deployment color
get_inactive_color() {
    local current_color=$(get_current_color)
    if [ "$current_color" = "blue" ]; then
        echo "green"
    else
        echo "blue"
    fi
}

# Update deployment image
update_deployment_image() {
    local color=$1
    local image=$2
    local deployment="sitespeak-web-$color"

    log_info "Updating $deployment with image $image"

    kubectl set image deployment/"$deployment" web="$image" -n "$NAMESPACE"

    log_info "Waiting for $deployment rollout to complete..."
    kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout="$KUBECTL_TIMEOUT"

    log_success "$deployment updated successfully"
}

# Scale deployment
scale_deployment() {
    local color=$1
    local replicas=$2
    local deployment="sitespeak-web-$color"

    log_info "Scaling $deployment to $replicas replicas"
    kubectl scale deployment/"$deployment" --replicas="$replicas" -n "$NAMESPACE"

    # Wait for scaling to complete
    kubectl wait --for=condition=available deployment/"$deployment" -n "$NAMESPACE" --timeout="$KUBECTL_TIMEOUT"

    log_success "$deployment scaled to $replicas replicas"
}

# Health check function
health_check() {
    local color=$1
    local service="sitespeak-${color}-service"

    log_info "Performing health check on $color deployment..."

    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        log_info "Health check attempt $i/$HEALTH_CHECK_RETRIES"

        # Port forward to the service
        kubectl port-forward service/"$service" 8080:5000 -n "$NAMESPACE" &
        local port_forward_pid=$!

        sleep 3  # Wait for port forward to establish

        # Perform health check
        if curl -f http://localhost:8080/health/ready > /dev/null 2>&1; then
            kill $port_forward_pid 2>/dev/null || true
            log_success "Health check passed for $color deployment"
            return 0
        fi

        kill $port_forward_pid 2>/dev/null || true

        if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
            log_warning "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done

    log_error "Health check failed for $color deployment after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Smoke test function
smoke_test() {
    local color=$1
    local service="sitespeak-${color}-service"

    log_info "Running smoke tests on $color deployment..."

    # Port forward for testing
    kubectl port-forward service/"$service" 8081:5000 -n "$NAMESPACE" &
    local port_forward_pid=$!

    sleep 3

    # Test critical endpoints
    local endpoints=(
        "/health/ready"
        "/health/live"
        "/api/health"
    )

    local all_tests_passed=true

    for endpoint in "${endpoints[@]}"; do
        log_info "Testing endpoint: $endpoint"
        if curl -f "http://localhost:8081$endpoint" > /dev/null 2>&1; then
            log_success "✓ $endpoint"
        else
            log_error "✗ $endpoint"
            all_tests_passed=false
        fi
    done

    kill $port_forward_pid 2>/dev/null || true

    if [ "$all_tests_passed" = true ]; then
        log_success "All smoke tests passed for $color deployment"
        return 0
    else
        log_error "Some smoke tests failed for $color deployment"
        return 1
    fi
}

# Switch traffic to new deployment
switch_traffic() {
    local new_color=$1

    log_info "Switching traffic to $new_color deployment..."

    # Update the active service selector
    kubectl patch service sitespeak-active-service -n "$NAMESPACE" \
        -p '{"spec":{"selector":{"version":"'"$new_color"'"}}}'

    # Update ingress annotation if needed
    kubectl annotate service sitespeak-active-service -n "$NAMESPACE" \
        deployment.sitespeak.ai/active-color="$new_color" --overwrite

    log_success "Traffic switched to $new_color deployment"

    # Wait a moment for the switch to propagate
    sleep 5

    # Verify the switch
    local current_color=$(get_current_color)
    if [ "$current_color" = "$new_color" ]; then
        log_success "Traffic switch verified - active color is now $new_color"
    else
        log_error "Traffic switch verification failed - active color is still $current_color"
        return 1
    fi
}

# Rollback function
rollback() {
    local rollback_color=$1

    log_warning "Initiating rollback to $rollback_color deployment..."

    if switch_traffic "$rollback_color"; then
        log_success "Rollback completed successfully"
    else
        log_error "Rollback failed!"
        exit 1
    fi
}

# Cleanup old deployment
cleanup_old_deployment() {
    local old_color=$1

    log_info "Cleaning up $old_color deployment..."

    # Scale down old deployment
    scale_deployment "$old_color" 0

    log_success "Cleanup completed for $old_color deployment"
}

# Main deployment function
deploy() {
    local image=$1
    local skip_cleanup=${2:-false}

    log_info "Starting blue-green deployment with image: $image"

    local current_color=$(get_current_color)
    local new_color=$(get_inactive_color)

    log_info "Current active deployment: $current_color"
    log_info "Deploying to: $new_color"

    # Step 1: Update inactive deployment
    update_deployment_image "$new_color" "$image"

    # Step 2: Scale up new deployment
    scale_deployment "$new_color" 2

    # Step 3: Health check
    if ! health_check "$new_color"; then
        log_error "Health check failed, aborting deployment"
        log_info "Scaling down failed deployment..."
        scale_deployment "$new_color" 0
        exit 1
    fi

    # Step 4: Smoke tests
    if ! smoke_test "$new_color"; then
        log_error "Smoke tests failed, aborting deployment"
        log_info "Scaling down failed deployment..."
        scale_deployment "$new_color" 0
        exit 1
    fi

    # Step 5: Switch traffic
    if ! switch_traffic "$new_color"; then
        log_error "Traffic switch failed, initiating rollback..."
        rollback "$current_color"
        exit 1
    fi

    # Step 6: Verify new deployment
    sleep 10  # Allow some time for real traffic

    if ! health_check "$new_color"; then
        log_error "Post-switch health check failed, initiating rollback..."
        rollback "$current_color"
        exit 1
    fi

    # Step 7: Cleanup old deployment (optional)
    if [ "$skip_cleanup" != "true" ]; then
        cleanup_old_deployment "$current_color"
    else
        log_info "Skipping cleanup of $current_color deployment (keep for quick rollback)"
    fi

    log_success "Deployment completed successfully!"
    log_success "Active deployment is now: $new_color"
}

# Show usage
usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
    deploy <image>              Deploy new image using blue-green strategy
    rollback                    Rollback to previous deployment
    status                      Show current deployment status
    switch <color>              Manually switch traffic to blue/green
    cleanup <color>             Cleanup specified deployment
    health-check <color>        Run health check on specified deployment

Options:
    --skip-cleanup              Skip cleanup of old deployment (for deploy)
    --force                     Force operation without confirmation

Examples:
    $0 deploy sitespeak/sitespeak:v1.2.3
    $0 deploy sitespeak/sitespeak:latest --skip-cleanup
    $0 rollback
    $0 status
    $0 switch green
    $0 cleanup blue
    $0 health-check green
EOF
}

# Parse command line arguments
main() {
    if [ $# -eq 0 ]; then
        usage
        exit 1
    fi

    check_prerequisites

    local command=$1
    shift

    case $command in
        deploy)
            if [ $# -eq 0 ]; then
                log_error "Image name required for deploy command"
                usage
                exit 1
            fi
            local image=$1
            shift
            local skip_cleanup=false

            while [[ $# -gt 0 ]]; do
                case $1 in
                    --skip-cleanup)
                        skip_cleanup=true
                        shift
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        usage
                        exit 1
                        ;;
                esac
            done

            deploy "$image" "$skip_cleanup"
            ;;
        rollback)
            local current_color=$(get_current_color)
            local rollback_color=$(get_inactive_color)

            log_warning "This will rollback from $current_color to $rollback_color"
            read -p "Are you sure? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                rollback "$rollback_color"
            else
                log_info "Rollback cancelled"
            fi
            ;;
        status)
            local current_color=$(get_current_color)
            local inactive_color=$(get_inactive_color)

            echo "=== Deployment Status ==="
            echo "Active deployment: $current_color"
            echo "Inactive deployment: $inactive_color"
            echo

            # Show deployment status
            kubectl get deployments -n "$NAMESPACE" -l app=sitespeak-web
            echo

            # Show service status
            kubectl get services -n "$NAMESPACE" -l app=sitespeak-web
            ;;
        switch)
            if [ $# -eq 0 ]; then
                log_error "Color (blue/green) required for switch command"
                exit 1
            fi
            local color=$1

            if [ "$color" != "blue" ] && [ "$color" != "green" ]; then
                log_error "Color must be 'blue' or 'green'"
                exit 1
            fi

            switch_traffic "$color"
            ;;
        cleanup)
            if [ $# -eq 0 ]; then
                log_error "Color (blue/green) required for cleanup command"
                exit 1
            fi
            local color=$1
            cleanup_old_deployment "$color"
            ;;
        health-check)
            if [ $# -eq 0 ]; then
                log_error "Color (blue/green) required for health-check command"
                exit 1
            fi
            local color=$1
            health_check "$color"
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"