import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: number;
  email: string;
}

export function signJwt(payload: JwtPayload, expiresIn = "7d") {
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
}

export function verifyJwt(token: string) {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
