import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

export function requireRole(role: UserRole | UserRole[]) {
  const roles = Array.isArray(role) ? role : [role];
  return function roleGuard(req: Request, res: Response, next: NextFunction) {
    const currentRole = req.currentAdmin?.role;
    if (!currentRole || !roles.includes(currentRole)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    return next();
  };
}

export const requireAdmin = requireRole("ADMIN");
