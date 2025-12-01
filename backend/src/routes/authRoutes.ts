import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { comparePassword } from "../utils/password";
import { signJwt } from "../utils/jwt";
import { asyncHandler } from "../utils/asyncHandler";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signJwt({ userId: user.id, email: user.email }, "12h");
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  }),
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await prisma.adminUser.findUnique({ where: { id: req.user!.id } });
    res.json({ user });
  }),
);

export const authRouter = router;
