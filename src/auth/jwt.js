import jwt from "jsonwebtoken";
import { config } from "../config.js";

const COOKIE_NAME = "admetrics_token";
const TTL = "7d";

export function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: TTL,
  });
}

export function verifySession(token) {
  return jwt.verify(token, config.jwtSecret);
}

export { COOKIE_NAME };

export function setAuthCookie(reply, token) {
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearAuthCookie(reply) {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}
