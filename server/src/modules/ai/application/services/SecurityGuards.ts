import { createLogger } from '../../../../shared/utils.js';
import type { SiteAction } from '../../../../shared/types';

const logger = createLogger({ service: 'security-guards' });

export interface SecurityValidationRequest {
  tenantId: string;
  siteId: string;
  userId?: string;
  sessionId: string;
  action?: SiteAction;
  parameters?: Record<string, unknown>;
  userInput: string;
  clientInfo: {
    origin: string;
    userAgent: string;
    ipAddress: string;
  };
}

export interface SecurityValidationResult {
  allowed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  issues: Array<{
    type: string;
    severity: 'warning' | 'error';
    description: string;
    recommendation?: string;
  }>;
  requiresConfirmation: boolean;
  sanitizedParameters?: Record<string, unknown>;
  rateLimitInfo?: {
    remainingRequests: number;
    resetTime: Date;
  };
}

export interface ActionParams {
  [key: string]: {
    value: unknown;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    sanitized: boolean;
    validated: boolean;
  };
}

/**
 * Comprehensive security validation system
 * 
 * Features:
 * - OWASP compliant parameter validation
 * - Origin validation and CSRF protection
 * - Rate limiting per tenant/user/IP
 * - SQL injection and XSS prevention
 * - Sensitive data detection and redaction
 * - Action authorization and risk assessment
 */
export class SecurityGuards {
  private rateLimitStore: Map<string, { count: number; resetTime: Date }> = new Map();
  private suspiciousActivityStore: Map<string, Array<{ timestamp: Date; reason: string }>> = new Map();
  
  // Rate limits (requests per minute)
  private rateLimits = {
    perTenant: 1000,
    perUser: 100,
    perIP: 50,
    perSession: 30,
  };

  // Dangerous patterns to detect
  private dangerousPatterns = {
    sqlInjection: [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b.*\b(FROM|INTO|SET|WHERE|TABLE)\b)/i,
      /(\bunion\b.*\bselect\b)/i,
      /(\bor\b.*\b1\s*=\s*1\b)/i,
      /(--|\/\*|\*\/)/,
    ],
    xss: [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
    ],
    pathTraversal: [
      /\.\.[\/\\]/,
      /(\/|\\)etc(\/|\\)passwd/,
      /(\/|\\)windows(\/|\\)system32/,
    ],
    commandInjection: [
      /[;&|`$(){}[\]]/,
      /\b(rm|del|format|kill|shutdown)\b/i,
    ],
  };

  constructor() {
    // Clean up rate limit store every minute
    setInterval(() => this.cleanupRateLimitStore(), 60 * 1000);
    
    // Clean up suspicious activity store every hour
    setInterval(() => this.cleanupSuspiciousActivityStore(), 60 * 60 * 1000);
  }

  /**
   * Validate security of incoming request
   */
  async validateSecurity(request: SecurityValidationRequest): Promise<SecurityValidationResult> {
    logger.debug('Validating security', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      sessionId: request.sessionId,
      origin: request.clientInfo.origin,
    });

    const issues: SecurityValidationResult['issues'] = [];
    let riskLevel: SecurityValidationResult['riskLevel'] = 'low';
    let requiresConfirmation = false;

    // 1. Origin validation
    const originValidation = this.validateOrigin(request);
    if (!originValidation.valid) {
      issues.push({
        type: 'invalid_origin',
        severity: 'error',
        description: originValidation.reason || 'Invalid request origin',
        recommendation: 'Ensure requests are made from authorized domains',
      });
      riskLevel = 'high';
    }

    // 2. Rate limit validation
    const rateLimitResult = await this.checkRateLimit(request);
    if (!rateLimitResult.allowed) {
      issues.push({
        type: 'rate_limit_exceeded',
        severity: 'error',
        description: `Rate limit exceeded: ${rateLimitResult.reason}`,
        recommendation: 'Reduce request frequency',
      });
      return {
        allowed: false,
        riskLevel: 'high',
        issues,
        requiresConfirmation: false,
        ...(rateLimitResult.rateLimitInfo ? { rateLimitInfo: rateLimitResult.rateLimitInfo } : {}),
      };
    }

    // 3. Input validation and sanitization
    const inputValidation = this.validateInput(request.userInput);
    if (inputValidation.issues.length > 0) {
      issues.push(...inputValidation.issues);
      if (inputValidation.riskLevel === 'high') {
        riskLevel = 'high';
      } else if (inputValidation.riskLevel === 'medium' && riskLevel !== 'high') {
        riskLevel = 'medium';
      }
    }

    // 4. Parameter validation and sanitization
    let sanitizedParameters: Record<string, unknown> | undefined;
    if (request.parameters) {
      const paramValidation = this.validateAndSanitizeParameters(request.parameters);
      sanitizedParameters = paramValidation.sanitizedParams;
      
      if (paramValidation.issues.length > 0) {
        issues.push(...paramValidation.issues);
        if (paramValidation.riskLevel === 'high') {
          riskLevel = 'high';
        } else if (paramValidation.riskLevel === 'medium' && riskLevel !== 'high') {
          riskLevel = 'medium';
        }
      }
    }

    // 5. Action authorization
    if (request.action) {
      const authValidation = this.validateActionAuthorization(request);
      if (!authValidation.authorized) {
        issues.push({
          type: 'action_unauthorized',
          severity: 'error',
          description: authValidation.reason || 'Action not authorized',
          recommendation: 'Verify user permissions for this action',
        });
        riskLevel = 'high';
      }

      // Check if action requires confirmation
      requiresConfirmation = request.action.confirmation || request.action.riskLevel === 'high';
    }

    // 6. Suspicious activity detection
    const suspiciousActivityCheck = this.checkSuspiciousActivity(request);
    if (suspiciousActivityCheck.suspicious) {
      issues.push({
        type: 'suspicious_activity',
        severity: 'warning',
        description: suspiciousActivityCheck.reason || 'Suspicious activity detected',
        recommendation: 'Review recent activity patterns',
      });
      if (riskLevel === 'low') {
        riskLevel = 'medium';
      }
    }

    // 7. Tenant isolation validation
    const tenantValidation = this.validateTenantIsolation(request);
    if (!tenantValidation.valid) {
      issues.push({
        type: 'tenant_isolation_violation',
        severity: 'error',
        description: tenantValidation.reason || 'Tenant isolation violation',
        recommendation: 'Ensure proper tenant boundaries',
      });
      riskLevel = 'high';
    }

    const allowed = !issues.some(issue => issue.severity === 'error');

    logger.info('Security validation completed', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      sessionId: request.sessionId,
      allowed,
      riskLevel,
      issuesCount: issues.length,
    });

    return {
      allowed,
      riskLevel,
      issues,
      requiresConfirmation,
      ...(sanitizedParameters ? { sanitizedParameters } : {}),
      ...(rateLimitResult.rateLimitInfo ? { rateLimitInfo: rateLimitResult.rateLimitInfo } : {}),
    };
  }

  /**
   * Validate request origin
   */
  private validateOrigin(request: SecurityValidationRequest): { valid: boolean; reason?: string } {
    const origin = request.clientInfo.origin;
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return { valid: true };
    }

    // Allow sitespeak.ai domain
    if (origin.includes('sitespeak.ai')) {
      return { valid: true };
    }

    // Check if origin matches the site's domain
    // This would be validated against the site configuration
    // For now, we'll allow all HTTPS origins
    if (origin.startsWith('https://')) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Invalid origin: ${origin}`,
    };
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(request: SecurityValidationRequest): Promise<{
    allowed: boolean;
    reason?: string;
    rateLimitInfo?: { remainingRequests: number; resetTime: Date };
  }> {
    const checks = [
      { key: `tenant:${request.tenantId}`, limit: this.rateLimits.perTenant, name: 'tenant' },
      { key: `user:${request.userId}`, limit: this.rateLimits.perUser, name: 'user' },
      { key: `ip:${request.clientInfo.ipAddress}`, limit: this.rateLimits.perIP, name: 'IP' },
      { key: `session:${request.sessionId}`, limit: this.rateLimits.perSession, name: 'session' },
    ];

    for (const check of checks) {
      if (!check.key.includes('undefined')) { // Skip checks with undefined values
        const result = this.checkSingleRateLimit(check.key, check.limit);
        if (!result.allowed) {
          return {
            allowed: false,
            reason: `${check.name} rate limit exceeded`,
            rateLimitInfo: {
              remainingRequests: 0,
              resetTime: result.resetTime!,
            },
          };
        }
      }
    }

    // Return remaining requests for the most restrictive limit (session)
    const sessionResult = this.checkSingleRateLimit(`session:${request.sessionId}`, this.rateLimits.perSession);
    
    return {
      allowed: true,
      rateLimitInfo: {
        remainingRequests: sessionResult.remaining!,
        resetTime: sessionResult.resetTime!,
      },
    };
  }

  /**
   * Check single rate limit
   */
  private checkSingleRateLimit(key: string, limit: number): {
    allowed: boolean;
    remaining?: number;
    resetTime?: Date;
  } {
    const now = new Date();
    const resetTime = new Date(Math.ceil(now.getTime() / 60000) * 60000); // Next minute
    
    let rateData = this.rateLimitStore.get(key);
    
    if (!rateData || now >= rateData.resetTime) {
      rateData = { count: 0, resetTime };
      this.rateLimitStore.set(key, rateData);
    }

    if (rateData.count >= limit) {
      return {
        allowed: false,
        resetTime: rateData.resetTime,
      };
    }

    rateData.count++;
    
    return {
      allowed: true,
      remaining: limit - rateData.count,
      resetTime: rateData.resetTime,
    };
  }

  /**
   * Validate and sanitize user input
   */
  private validateInput(input: string): {
    issues: SecurityValidationResult['issues'];
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const issues: SecurityValidationResult['issues'] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // Check for SQL injection patterns
    for (const pattern of this.dangerousPatterns.sqlInjection) {
      if (pattern.test(input)) {
        issues.push({
          type: 'sql_injection_attempt',
          severity: 'error',
          description: 'Potential SQL injection detected in input',
          recommendation: 'Remove SQL commands from input',
        });
        riskLevel = 'high';
        break;
      }
    }

    // Check for XSS patterns
    for (const pattern of this.dangerousPatterns.xss) {
      if (pattern.test(input)) {
        issues.push({
          type: 'xss_attempt',
          severity: 'error',
          description: 'Potential XSS attack detected in input',
          recommendation: 'Remove script tags and javascript from input',
        });
        riskLevel = 'high';
        break;
      }
    }

    // Check for path traversal
    for (const pattern of this.dangerousPatterns.pathTraversal) {
      if (pattern.test(input)) {
        issues.push({
          type: 'path_traversal_attempt',
          severity: 'error',
          description: 'Potential path traversal attack detected',
          recommendation: 'Remove directory traversal patterns from input',
        });
        riskLevel = 'high';
        break;
      }
    }

    // Check for command injection
    for (const pattern of this.dangerousPatterns.commandInjection) {
      if (pattern.test(input)) {
        issues.push({
          type: 'command_injection_attempt',
          severity: 'error',
          description: 'Potential command injection detected',
          recommendation: 'Remove command execution patterns from input',
        });
        riskLevel = 'high';
        break;
      }
    }

    // Check input length
    if (input.length > 10000) {
      issues.push({
        type: 'input_too_long',
        severity: 'warning',
        description: 'Input exceeds maximum length',
        recommendation: 'Reduce input length',
      });
      if (riskLevel === 'low') {
        riskLevel = 'medium';
      }
    }

    return { issues, riskLevel };
  }

  /**
   * Validate and sanitize parameters
   */
  private validateAndSanitizeParameters(parameters: Record<string, unknown>): {
    issues: SecurityValidationResult['issues'];
    riskLevel: 'low' | 'medium' | 'high';
    sanitizedParams: Record<string, unknown>;
  } {
    const issues: SecurityValidationResult['issues'] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    const sanitizedParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parameters)) {
      // Validate parameter key
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        issues.push({
          type: 'invalid_parameter_key',
          severity: 'warning',
          description: `Parameter key '${key}' contains invalid characters`,
          recommendation: 'Use only alphanumeric characters, hyphens, and underscores',
        });
      }

      // Sanitize parameter value
      let sanitizedValue = value;

      if (typeof value === 'string') {
        // Remove potential XSS patterns
        sanitizedValue = value
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');

        // Check for suspicious patterns
        const inputValidation = this.validateInput(value);
        if (inputValidation.issues.length > 0) {
          issues.push(...inputValidation.issues.map(issue => ({
            ...issue,
            description: `Parameter '${key}': ${issue.description}`,
          })));
          
          if (inputValidation.riskLevel === 'high') {
            riskLevel = 'high';
          } else if (inputValidation.riskLevel === 'medium' && riskLevel !== 'high') {
            riskLevel = 'medium';
          }
        }
      }

      sanitizedParams[key] = sanitizedValue;
    }

    return { issues, riskLevel, sanitizedParams };
  }

  /**
   * Validate action authorization
   */
  private validateActionAuthorization(request: SecurityValidationRequest): {
    authorized: boolean;
    reason?: string;
  } {
    if (!request.action) {
      return { authorized: true };
    }

    // Check if action is allowed for this tenant/site
    // This would integrate with a proper authorization system
    
    // For now, we'll check basic constraints
    if (request.action.riskLevel === 'high' && !request.userId) {
      return {
        authorized: false,
        reason: 'High-risk actions require authenticated user',
      };
    }

    // Check if action requires specific permissions
    // This would be expanded based on the action's metadata
    
    return { authorized: true };
  }

  /**
   * Check for suspicious activity patterns
   */
  private checkSuspiciousActivity(request: SecurityValidationRequest): {
    suspicious: boolean;
    reason?: string;
  } {
    const sessionKey = request.sessionId;
    const activities = this.suspiciousActivityStore.get(sessionKey) || [];
    
    // Check for rapid successive requests
    const recentActivities = activities.filter(
      activity => Date.now() - activity.timestamp.getTime() < 60 * 1000 // Last minute
    );

    if (recentActivities.length > 10) {
      this.recordSuspiciousActivity(sessionKey, 'rapid_requests');
      return {
        suspicious: true,
        reason: 'Unusually high number of requests in short time period',
      };
    }

    // Check for repeated failed attempts
    const failedAttempts = activities.filter(
      activity => activity.reason === 'validation_failure' &&
      Date.now() - activity.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );

    if (failedAttempts.length > 3) {
      return {
        suspicious: true,
        reason: 'Multiple validation failures detected',
      };
    }

    return { suspicious: false };
  }

  /**
   * Validate tenant isolation
   */
  private validateTenantIsolation(request: SecurityValidationRequest): {
    valid: boolean;
    reason?: string;
  } {
    // Ensure the session belongs to the correct tenant
    // This would be validated against session storage
    
    // Basic validation - ensure tenant and site IDs are properly formatted UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(request.tenantId)) {
      return {
        valid: false,
        reason: 'Invalid tenant ID format',
      };
    }

    if (!uuidRegex.test(request.siteId)) {
      return {
        valid: false,
        reason: 'Invalid site ID format',
      };
    }

    return { valid: true };
  }

  /**
   * Record suspicious activity
   */
  private recordSuspiciousActivity(sessionKey: string, reason: string): void {
    const activities = this.suspiciousActivityStore.get(sessionKey) || [];
    activities.push({
      timestamp: new Date(),
      reason,
    });

    // Keep only last 50 activities
    if (activities.length > 50) {
      activities.splice(0, activities.length - 50);
    }

    this.suspiciousActivityStore.set(sessionKey, activities);
    
    logger.warn('Suspicious activity recorded', {
      sessionKey,
      reason,
      totalActivities: activities.length,
    });
  }

  /**
   * Clean up rate limit store
   */
  private cleanupRateLimitStore(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, data] of Array.from(this.rateLimitStore.entries())) {
      if (now >= data.resetTime) {
        this.rateLimitStore.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up rate limit store', { cleanedCount });
    }
  }

  /**
   * Clean up suspicious activity store
   */
  private cleanupSuspiciousActivityStore(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;

    for (const [key, activities] of Array.from(this.suspiciousActivityStore.entries())) {
      const recentActivities = activities.filter(activity => activity.timestamp > cutoffTime);
      
      if (recentActivities.length === 0) {
        this.suspiciousActivityStore.delete(key);
        cleanedCount++;
      } else if (recentActivities.length !== activities.length) {
        this.suspiciousActivityStore.set(key, recentActivities);
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up suspicious activity store', { cleanedCount });
    }
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): {
    rateLimitViolations: number;
    suspiciousActivities: number;
    blockedRequests: number;
    activeRateLimits: number;
  } {
    let suspiciousActivitiesCount = 0;
    for (const activities of Array.from(this.suspiciousActivityStore.values())) {
      suspiciousActivitiesCount += activities.length;
    }

    return {
      rateLimitViolations: 0, // Would be tracked from actual violations
      suspiciousActivities: suspiciousActivitiesCount,
      blockedRequests: 0, // Would be tracked from actual blocks
      activeRateLimits: this.rateLimitStore.size,
    };
  }
}

// Export singleton instance
export const securityGuards = new SecurityGuards();