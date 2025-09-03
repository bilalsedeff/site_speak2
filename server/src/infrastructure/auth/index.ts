/**
 * Authentication Infrastructure
 */

import { Request, Response, NextFunction } from 'express';

// Re-export existing implementations  
export * from './jwt';
export * from './session';
export * from './middleware';

// Re-export service instances
export { jwtService } from './jwt';
export { sessionManager } from './session';

// Placeholder auth middleware - implement when needed
export function optionalAuth() {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // Skip authentication for now
    next();
  };
}

export function authErrorHandler() {
  return (error: Error, _req: Request, res: Response, next: NextFunction): void => {
    if (error.name === 'AuthenticationError') {
      res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }
    next(error);
  };
}