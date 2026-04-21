import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./auth";
import { prisma } from "../prisma";

export function audit(action: string) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          schoolId: req.user.schoolId,
          userId: req.user.sub,
          action,
          metadata: {
            path: req.path,
            method: req.method
          }
        }
      });
    }
    next();
  };
}
