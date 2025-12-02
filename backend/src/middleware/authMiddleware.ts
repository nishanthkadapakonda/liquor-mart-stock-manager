import type { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../utils/jwt";
import { prisma } from "../prisma";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = header.replace("Bearer ", "");
    const payload = verifyJwt(token);
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.userId } });
    if (!admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    req.currentAdmin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
