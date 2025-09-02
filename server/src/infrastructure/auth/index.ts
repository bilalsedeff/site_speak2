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
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip authentication for now
    next();
  };
}

export function authErrorHandler() {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error.name === 'AuthenticationError') {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }
    next(error);
  };
}