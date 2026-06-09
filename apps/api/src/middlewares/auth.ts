import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = {
  sub: string;
  role: "SUPER_ADMIN" | "OWNER" | "ADMIN" | "FINANCIAL_MANAGER" | "ACCOUNTANT" | "CASHIER" | "HR_MANAGER" | "AUDITOR" | "PARENT";
  schoolId: string;
};

export type AuthenticatedRequest = Request & { user?: JwtPayload };

export function authGuard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: "Non authentifie" });
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Token invalide" });
  }
}

export function authorize(...roles: Array<JwtPayload["role"]>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non authentifie" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Acces refuse" });
    }
    return next();
  };
}
