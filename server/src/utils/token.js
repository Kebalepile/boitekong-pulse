import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken({ userId, roles = [] }) {
  return jwt.sign({ roles }, env.jwtSecret, {
    subject: String(userId),
    expiresIn: env.jwtExpiresIn
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
