import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAdmin } from "../middleware/requireRole";
import { hashPassword } from "../utils/password";
import { USER_ROLES } from "../types/domain";

const router = Router();

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  role: z.enum(USER_ROLES).default("VIEWER"),
});

const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
    res.json({ users });
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = userSchema.parse(req.body);
    try {
      const passwordHash = await hashPassword(payload.password);
      const user = await prisma.adminUser.create({
        data: {
          email: payload.email,
          name: payload.name ?? null,
          role: payload.role,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ message: "Email already exists" });
      }
      throw error;
    }
  }),
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = userIdParamSchema.parse(req.params);

    if (req.currentAdmin?.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "ADMIN") {
      const adminCount = await prisma.adminUser.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "At least one admin is required" });
      }
    }

    await prisma.adminUser.delete({ where: { id } });
    res.json({ success: true });
  }),
);

export const userRouter = router;
