import type { AdminUser } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: import("@prisma/client").UserRole;
      };
      currentAdmin?: AdminUser;
    }
  }
}

export {};
