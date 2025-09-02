import { Request, Response, NextFunction } from 'express';

export declare function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireTenantAccess(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireAdminAccess(req: Request, res: Response, next: NextFunction): Promise<void>;

export declare const jwtService: any;
export declare const sessionManager: any;
