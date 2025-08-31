/**
 * Authentication Infrastructure
 */

import { Request, Response, NextFunction } from 'express';

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