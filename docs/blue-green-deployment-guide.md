# SiteSpeak Blue-Green Deployment Guide

This guide provides comprehensive instructions for setting up and managing blue-green deployments for SiteSpeak in production environments.

## Architecture Overview

The blue-green deployment setup provides:

- **Zero-downtime deployments** with instant rollback capability
- **Traffic routing** between blue and green environments
- **Automated health checks** and smoke testing
- **Performance monitoring** during deployments
- **Gradual rollout capabilities** with traffic splitting

### Components

1. **Blue/Green Deployments**: Separate identical production environments
2. **NGINX Load Balancer**: Routes traffic based on deployment state
3. **Deployment Controller**: Manages blue-green switching logic
4. **Monitoring Stack**: Prometheus + Grafana for observability
5. **Kubernetes Resources**: HPA, PDB, NetworkPolicies for resilience

## Prerequisites

### System Requirements

- **Kubernetes Cluster**: v1.24+ with RBAC enabled
- **Storage**: 200GB+ persistent storage (ReadWriteMany)
- **Network**: Load balancer with SSL termination capability
- **Monitoring**: Prometheus Operator installed

### Required Tools

```bash
# Install required CLI tools
kubectl version --client  # v1.24+
helm version              # v3.8+
```

### Environment Setup

1. **Namespace Creation**:
```bash
kubectl apply -f k8s/namespace.yaml
```

2. **Secrets Configuration**:
```bash
# Copy and edit secrets template
cp k8s/secrets.yaml k8s/secrets-production.yaml

# Update with actual values:
# - OPENAI_API_KEY
# - JWT_SECRET (32+ characters)
# - DATABASE_URL
# - REDIS_URL
# - CDN credentials

kubectl apply -f k8s/secrets-production.yaml
```

3. **ConfigMaps**:
```bash
kubectl apply -f k8s/configmap.yaml
```

## Initial Deployment

### Step 1: Deploy Infrastructure

```bash
# Apply all Kubernetes manifests
kubectl apply -f k8s/deployment-blue.yaml
kubectl apply -f k8s/deployment-green.yaml
kubectl apply -f k8s/deployment-worker.yaml
kubectl apply -f k8s/deployment-controller.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/monitoring.yaml
```

### Step 2: Verify Infrastructure

```bash
# Check all deployments
kubectl get deployments -n sitespeak

# Check services
kubectl get services -n sitespeak

# Check ingress
kubectl get ingress -n sitespeak

# Check persistent volumes
kubectl get pvc -n sitespeak
```

### Step 3: Initial Blue Deployment

```bash
# Deploy initial application to blue environment
./scripts/blue-green-deploy.sh deploy sitespeak/sitespeak:v1.0.0

# Verify deployment
./scripts/blue-green-deploy.sh status
```

## Daily Operations

### Deploying New Versions

#### Standard Deployment

```bash
# Deploy new version (automatic blue-green switching)
./scripts/blue-green-deploy.sh deploy sitespeak/sitespeak:v1.1.0

# Deploy with manual cleanup (keeps old version for quick rollback)
./scripts/blue-green-deploy.sh deploy sitespeak/sitespeak:v1.1.0 --skip-cleanup
```

#### Manual Testing Before Switch

```bash
# Deploy to inactive environment (green)
kubectl set image deployment/sitespeak-web-green web=sitespeak/sitespeak:v1.1.0 -n sitespeak

# Scale up green deployment
kubectl scale deployment/sitespeak-web-green --replicas=2 -n sitespeak

# Test green deployment via staging ingress
curl https://staging.sitespeak.ai/health

# Manual traffic switch after validation
./scripts/blue-green-deploy.sh switch green

# Cleanup old deployment
./scripts/blue-green-deploy.sh cleanup blue
```

### Rollback Procedures

#### Immediate Rollback

```bash
# Instant rollback to previous version
./scripts/blue-green-deploy.sh rollback
```

#### Manual Rollback

```bash
# Check current deployment status
./scripts/blue-green-deploy.sh status

# Switch to specific color
./scripts/blue-green-deploy.sh switch blue  # or green
```

### Health Monitoring

#### Check Deployment Health

```bash
# Health check specific deployment
./scripts/blue-green-deploy.sh health-check blue
./scripts/blue-green-deploy.sh health-check green

# View application logs
kubectl logs -f deployment/sitespeak-web-blue -n sitespeak
kubectl logs -f deployment/sitespeak-web-green -n sitespeak
```

#### Monitor Performance

```bash
# Check HPA status
kubectl get hpa -n sitespeak

# View resource usage
kubectl top pods -n sitespeak

# Check metrics endpoint
kubectl port-forward service/sitespeak-active-service 8080:5000 -n sitespeak
curl http://localhost:8080/metrics
```

## Advanced Configuration

### Traffic Splitting

For gradual rollouts, configure traffic splitting:

```yaml
# Update ingress annotations for canary deployment
nginx.ingress.kubernetes.io/canary: "true"
nginx.ingress.kubernetes.io/canary-weight: "10"  # 10% to new version
```

### Custom Health Checks

Extend health check endpoints in your application:

```javascript
// Add to your Express app
app.get('/health/startup', (req, res) => {
  // Check if application is ready to serve traffic
  res.status(200).json({ status: 'ready' });
});

app.get('/health/live', (req, res) => {
  // Check if application is alive (restart if fails)
  res.status(200).json({ status: 'alive' });
});

app.get('/health/ready', (req, res) => {
  // Check if application can serve requests
  res.status(200).json({ status: 'ready' });
});
```

### Database Migrations

For database migrations during deployment:

```bash
# Run migrations on worker deployment
kubectl create job --from=deployment/sitespeak-worker migrate-$(date +%s) -n sitespeak
kubectl wait --for=condition=complete job/migrate-* -n sitespeak --timeout=300s

# Then proceed with deployment
./scripts/blue-green-deploy.sh deploy sitespeak/sitespeak:v1.2.0
```

## Monitoring and Alerting

### Grafana Dashboards

Access Grafana dashboards:

```bash
# Port forward to Grafana
kubectl port-forward service/grafana 3000:3000 -n monitoring

# Navigate to http://localhost:3000
# Default credentials: admin/admin
```

Key dashboards:
- **SiteSpeak Overview**: Application performance metrics
- **Blue-Green Status**: Deployment health and traffic distribution
- **Voice Performance**: Voice-specific latency and error metrics

### Alert Configuration

Critical alerts are configured in `k8s/monitoring.yaml`:

- **High Error Rate**: >10% 5xx responses
- **High Latency**: >2s 95th percentile
- **Voice Latency**: >300ms first token latency
- **Deployment Issues**: Pod failures or imbalanced deployments
- **Resource Usage**: High memory/CPU usage

### Log Aggregation

Configure log aggregation (optional):

```bash
# Deploy ELK stack or use cloud logging
helm install elasticsearch elastic/elasticsearch
helm install kibana elastic/kibana
helm install filebeat elastic/filebeat
```

## Security Considerations

### Network Policies

Network policies are configured to:
- Isolate web tier from worker tier
- Allow only necessary communication between services
- Restrict admin access to deployment controller

### Secret Management

For production environments:

```bash
# Use sealed-secrets for GitOps
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Or use external-secrets with cloud providers
helm install external-secrets external-secrets/external-secrets
```

### SSL/TLS Configuration

SSL certificates are managed via cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.8.0/cert-manager.yaml

# Configure Let's Encrypt issuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@sitespeak.ai
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Troubleshooting

### Common Issues

#### Deployment Stuck

```bash
# Check deployment status
kubectl describe deployment sitespeak-web-blue -n sitespeak

# Check pod events
kubectl get events -n sitespeak --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs -f deployment/sitespeak-web-blue -n sitespeak
```

#### Health Check Failures

```bash
# Test health endpoints directly
kubectl port-forward service/sitespeak-blue-service 8080:5000 -n sitespeak
curl -v http://localhost:8080/health/ready

# Check application logs for errors
kubectl logs -f deployment/sitespeak-web-blue -n sitespeak --tail=100
```

#### Traffic Not Switching

```bash
# Verify service selector
kubectl get service sitespeak-active-service -o yaml -n sitespeak

# Check ingress configuration
kubectl describe ingress sitespeak-ingress -n sitespeak

# Test DNS resolution
nslookup api.sitespeak.ai
```

#### Resource Issues

```bash
# Check resource limits and requests
kubectl describe pod -l app=sitespeak-web -n sitespeak

# Check node capacity
kubectl describe nodes

# Check HPA status
kubectl describe hpa sitespeak-web-blue-hpa -n sitespeak
```

### Recovery Procedures

#### Complete Service Recovery

```bash
# 1. Scale down all deployments
kubectl scale deployment --all --replicas=0 -n sitespeak

# 2. Check and fix underlying issues (database, secrets, etc.)

# 3. Scale up blue deployment
kubectl scale deployment/sitespeak-web-blue --replicas=2 -n sitespeak

# 4. Verify health
./scripts/blue-green-deploy.sh health-check blue

# 5. Update active service
./scripts/blue-green-deploy.sh switch blue
```

#### Database Recovery

```bash
# Check database connectivity
kubectl run --rm -i --tty debug --image=postgres:15 --restart=Never -- psql $DATABASE_URL

# Run database recovery if needed
kubectl create job --from=deployment/sitespeak-worker db-recovery -n sitespeak
```

## Performance Optimization

### Resource Tuning

Adjust resource requests and limits based on monitoring:

```yaml
resources:
  requests:
    memory: "512Mi"    # Increase if seeing OOMKilled
    cpu: "250m"        # Increase if CPU throttling
  limits:
    memory: "2Gi"      # Adjust based on actual usage
    cpu: "1000m"       # Adjust based on actual usage
```

### HPA Configuration

Tune autoscaling parameters:

```yaml
metrics:
- type: Resource
  resource:
    name: cpu
    target:
      type: Utilization
      averageUtilization: 70  # Adjust based on performance
- type: Resource
  resource:
    name: memory
    target:
      type: Utilization
      averageUtilization: 80  # Adjust based on performance
```

### Database Optimization

- Use connection pooling (configured in application)
- Implement read replicas for analytics workloads
- Monitor slow queries and optimize indexes

## Backup and Disaster Recovery

### Database Backups

```bash
# Create database backup job
kubectl create job --from=deployment/sitespeak-worker backup-$(date +%Y%m%d) -n sitespeak
```

### Configuration Backups

```bash
# Backup all Kubernetes resources
kubectl get all,configmap,secret,pvc,ingress -o yaml -n sitespeak > sitespeak-backup-$(date +%Y%m%d).yaml
```

### Multi-Region Setup

For high availability across regions:

1. Deploy identical infrastructure in multiple regions
2. Use global load balancer for traffic distribution
3. Implement database replication across regions
4. Use consistent secret management across regions

This comprehensive setup ensures robust, scalable, and maintainable blue-green deployments for SiteSpeak in production environments.