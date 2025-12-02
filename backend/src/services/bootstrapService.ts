import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../prisma";
import { hashPassword } from "../utils/password";

export async function ensureBootstrapData() {
  await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      defaultBeltMarkupRupees: new Prisma.Decimal(20),
      defaultLowStockThreshold: 10,
    },
    update: {},
  });

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: env.adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await hashPassword(env.adminPassword);
    await prisma.adminUser.create({
      data: {
        email: env.adminEmail,
        passwordHash,
        name: "Admin",
        role: "ADMIN",
      },
    });
  }
}
