import { Request, Response, NextFunction } from 'express';

export declare function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function createRateLimiter(options?: any): any;
export declare const rateLimiters: any;
