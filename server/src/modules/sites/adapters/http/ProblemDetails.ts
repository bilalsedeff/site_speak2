/**
 * Problem Details for HTTP APIs (RFC 9457)
 * 
 * Implements standard error responses for HTTP APIs following RFC 9457.
 * Provides consistent error formatting across all site-related endpoints.
 */

import { Response } from 'express';

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

export class ProblemDetailsBuilder {
  private problem: ProblemDetail;

  constructor(status: number, title: string, type?: string) {
    this.problem = {
      type: type || `https://sitespeak.com/problems/${this.getDefaultType(status)}`,
      title,
      status,
    };
  }

  withDetail(detail: string): this {
    this.problem.detail = detail;
    return this;
  }

  withInstance(instance: string): this {
    this.problem.instance = instance;
    return this;
  }

  withProperty(key: string, value: unknown): this {
    this.problem[key] = value;
    return this;
  }

  withValidationErrors(errors: ValidationError[]): this {
    this.problem['errors'] = errors;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.problem['correlationId'] = correlationId;
    return this;
  }

  withTimestamp(): this {
    this.problem['timestamp'] = new Date().toISOString();
    return this;
  }

  build(): ProblemDetail {
    return { ...this.problem };
  }

  send(res: Response): void {
    res.status(this.problem.status)
       .header('Content-Type', 'application/problem+json')
       .json(this.problem);
  }

  private getDefaultType(status: number): string {
    switch (status) {
      case 400: return 'bad-request';
      case 401: return 'unauthorized';
      case 403: return 'forbidden';
      case 404: return 'not-found';
      case 409: return 'conflict';
      case 412: return 'precondition-failed';
      case 422: return 'unprocessable-entity';
      case 429: return 'too-many-requests';
      case 500: return 'internal-server-error';
      case 502: return 'bad-gateway';
      case 503: return 'service-unavailable';
      default: return 'unknown-error';
    }
  }
}

export class ProblemDetails {
  /**
   * Create a standard Problem Details response
   */
  static create(status: number, title: string, type?: string): ProblemDetailsBuilder {
    return new ProblemDetailsBuilder(status, title, type);
  }

  /**
   * 400 Bad Request
   */
  static badRequest(detail?: string, instance?: string): ProblemDetail {
    const builder = this.create(400, 'Bad Request')
      .withDetail(detail || 'The request could not be understood by the server');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 401 Unauthorized
   */
  static unauthorized(detail?: string, instance?: string): ProblemDetail {
    const builder = this.create(401, 'Unauthorized')
      .withDetail(detail || 'Authentication is required to access this resource');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 403 Forbidden
   */
  static forbidden(detail?: string, instance?: string): ProblemDetail {
    const builder = this.create(403, 'Forbidden')
      .withDetail(detail || 'Access to this resource is forbidden');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 404 Not Found
   */
  static notFound(resource: string, instance?: string): ProblemDetail {
    const builder = this.create(404, 'Resource Not Found')
      .withDetail(`The requested ${resource} could not be found`);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 409 Conflict
   */
  static conflict(detail: string, instance?: string): ProblemDetail {
    const builder = this.create(409, 'Conflict')
      .withDetail(detail);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 412 Precondition Failed (ETag mismatch)
   */
  static preconditionFailed(detail?: string, instance?: string): ProblemDetail {
    const builder = this.create(412, 'Precondition Failed')
      .withDetail(detail || 'The ETag provided does not match the current resource version')
      .withProperty('expectedEtag', 'See ETag header in GET response');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 422 Unprocessable Entity (validation errors)
   */
  static validationError(errors: ValidationError[], instance?: string): ProblemDetail {
    const builder = this.create(422, 'Validation Failed')
      .withDetail('The request contains invalid data')
      .withValidationErrors(errors);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * 429 Too Many Requests
   */
  static tooManyRequests(retryAfter?: number, instance?: string): ProblemDetail {
    const builder = this.create(429, 'Too Many Requests')
      .withDetail('Rate limit exceeded');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    builder.withTimestamp();

    if (retryAfter) {
      builder.withProperty('retryAfter', retryAfter);
    }

    return builder.build();
  }

  /**
   * 500 Internal Server Error
   */
  static internalServerError(correlationId?: string, instance?: string): ProblemDetail {
    const builder = this.create(500, 'Internal Server Error')
      .withDetail('An unexpected error occurred while processing the request');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    builder.withTimestamp();

    if (correlationId) {
      builder.withCorrelationId(correlationId);
    }

    return builder.build();
  }

  /**
   * 503 Service Unavailable
   */
  static serviceUnavailable(retryAfter?: number, instance?: string): ProblemDetail {
    const builder = this.create(503, 'Service Unavailable')
      .withDetail('The service is temporarily unavailable');
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    builder.withTimestamp();

    if (retryAfter) {
      builder.withProperty('retryAfter', retryAfter);
    }

    return builder.build();
  }

  /**
   * Site-specific problem details
   */
  static siteNotFound(siteId: string, instance?: string): ProblemDetail {
    const builder = this.create(404, 'Site Not Found', 'https://sitespeak.com/problems/site-not-found')
      .withDetail(`Site with ID '${siteId}' could not be found`)
      .withProperty('siteId', siteId);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static siteAlreadyExists(identifier: string, instance?: string): ProblemDetail {
    const builder = this.create(409, 'Site Already Exists', 'https://sitespeak.com/problems/site-already-exists')
      .withDetail(`Site with identifier '${identifier}' already exists`)
      .withProperty('identifier', identifier);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static domainAlreadyExists(domain: string, instance?: string): ProblemDetail {
    const builder = this.create(409, 'Domain Already Exists', 'https://sitespeak.com/problems/domain-already-exists')
      .withDetail(`Domain '${domain}' is already in use`)
      .withProperty('domain', domain);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static publishingInProgress(siteId: string, instance?: string): ProblemDetail {
    const builder = this.create(409, 'Publishing in Progress', 'https://sitespeak.com/problems/publishing-in-progress')
      .withDetail(`Site '${siteId}' is currently being published`)
      .withProperty('siteId', siteId);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static domainVerificationRequired(domain: string, instance?: string): ProblemDetail {
    const builder = this.create(422, 'Domain Verification Required', 'https://sitespeak.com/problems/domain-verification-required')
      .withDetail(`Domain '${domain}' requires verification before it can be used`)
      .withProperty('domain', domain)
      .withProperty('verificationMethods', ['HTTP-01', 'DNS-01']);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static assetTooLarge(maxSize: number, actualSize: number, instance?: string): ProblemDetail {
    const builder = this.create(413, 'Asset Too Large', 'https://sitespeak.com/problems/asset-too-large')
      .withDetail(`Asset size ${actualSize} bytes exceeds maximum allowed size of ${maxSize} bytes`)
      .withProperty('maxSize', maxSize)
      .withProperty('actualSize', actualSize);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  static unsupportedContentType(contentType: string, allowedTypes: string[], instance?: string): ProblemDetail {
    const builder = this.create(415, 'Unsupported Media Type', 'https://sitespeak.com/problems/unsupported-content-type')
      .withDetail(`Content type '${contentType}' is not supported`)
      .withProperty('contentType', contentType)
      .withProperty('allowedTypes', allowedTypes);
    
    if (instance) {
      builder.withInstance(instance);
    }
    
    return builder.withTimestamp().build();
  }

  /**
   * Send problem details response
   */
  static send(res: Response, problem: ProblemDetail): void {
    res.status(problem.status)
       .header('Content-Type', 'application/problem+json')
       .json(problem);
  }

  /**
   * Create problem from error
   */
  static fromError(error: Error, status: number = 500, instance?: string, correlationId?: string): ProblemDetail {
    let problem: ProblemDetail;

    switch (error.name) {
      case 'SiteNotFoundError':
        problem = this.siteNotFound(error.message.split(': ')[1] || 'unknown', instance);
        break;
      case 'SubdomainExistsError':
      case 'CustomDomainExistsError':
        { const identifier = error.message.split(': ')[1] || 'unknown';
        problem = error.name === 'SubdomainExistsError' 
          ? this.siteAlreadyExists(identifier, instance)
          : this.domainAlreadyExists(identifier, instance);
        break; }
      case 'ValidationError':
        problem = this.validationError([], instance);
        break;
      default:
        problem = status >= 500 
          ? this.internalServerError(correlationId, instance)
          : this.badRequest(error.message, instance);
    }

    return problem;
  }
}

/**
 * Express middleware for handling uncaught errors with Problem Details
 */
export function problemDetailsErrorHandler(
  error: Error,
  req: any,
  res: Response,
  _next: any
): void {
  const instance = `${req.method} ${req.path}`;
  const correlationId = req.correlationId;

  const problem = ProblemDetails.fromError(error, 500, instance, correlationId);
  ProblemDetails.send(res, problem);
}