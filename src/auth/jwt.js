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

/** Cross-origin front (ex. Vercel) + API (ex. Render) precisa SameSite=None e Secure. */
function sessionCookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return {
    path: "/",
    httpOnly: true,
    sameSite: prod ? "none" : "lax",
    secure: prod,
    maxAge: 7 * 24 * 60 * 60,
  };
}

export function setAuthCookie(reply, token) {
  reply.setCookie(COOKIE_NAME, token, sessionCookieOptions());
}

export function clearAuthCookie(reply) {
  const { path, sameSite, secure, httpOnly } = sessionCookieOptions();
  reply.clearCookie(COOKIE_NAME, { path, sameSite, secure, httpOnly });
}
