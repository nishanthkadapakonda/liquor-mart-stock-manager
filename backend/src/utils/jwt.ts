import jwt, { type JwtPayload as JsonWebTokenPayload, type Secret, type SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "../config/env";
import type { UserRole } from "@prisma/client";

export interface AuthTokenPayload extends JsonWebTokenPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export function signJwt(payload: AuthTokenPayload, expiresIn: StringValue | number = "7d") {
  return jwt.sign(payload, env.jwtSecret as Secret, {
    expiresIn,
  } satisfies SignOptions);
}

export function verifyJwt(token: string) {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
