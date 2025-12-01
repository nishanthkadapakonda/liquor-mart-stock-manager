import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function withPrisma<T>(cb: (client: PrismaClient) => Promise<T>) {
  try {
    return await cb(prisma);
  } finally {
    // no-op but handy if we ever need scoped handling
  }
}
