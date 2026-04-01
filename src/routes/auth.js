import bcrypt from "bcrypt";
import { pool } from "../db/pool.js";
import {
  signSession,
  setAuthCookie,
  clearAuthCookie,
  COOKIE_NAME,
  verifySession,
} from "../auth/jwt.js";

const SALT_ROUNDS = 10;

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function authRoutes(fastify, _opts) {
  fastify.post("/auth/register", async (request, reply) => {
    const { email, password } = request.body || {};
    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return reply.code(400).send({
        error:
          "Email válido e senha com pelo menos 8 caracteres são obrigatórios.",
      });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    let user;
    try {
      const r = await pool.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email.toLowerCase().trim(), passwordHash],
      );
      user = r.rows[0];
    } catch (e) {
      if (e.code === "23505") {
        return reply.code(409).send({ error: "Este email já está registado." });
      }
      throw e;
    }
    const token = signSession(user);
    setAuthCookie(reply, token);
    return reply.send({
      user: { id: user.id, email: user.email, createdAt: user.created_at },
    });
  });

  fastify.post("/auth/login", async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      return reply.code(400).send({ error: "Email e senha são obrigatórios." });
    }
    const r = await pool.query(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
      [String(email).toLowerCase().trim()],
    );
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.code(401).send({ error: "Credenciais inválidas." });
    }
    const token = signSession({
      id: user.id,
      email: user.email,
    });
    setAuthCookie(reply, token);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  });

  fastify.post("/auth/logout", async (_request, reply) => {
    clearAuthCookie(reply);
    return reply.send({ ok: true });
  });

  fastify.get("/auth/me", async (request, reply) => {
    const token =
      request.cookies[COOKIE_NAME] ||
      (request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice(7)
        : null);
    if (!token) {
      return reply.code(401).send({ user: null });
    }
    try {
      const payload = verifySession(token);
      const r = await pool.query(
        `SELECT id, email, created_at FROM users WHERE id = $1`,
        [payload.sub],
      );
      const user = r.rows[0];
      if (!user) {
        return reply.code(401).send({ user: null });
      }
      return reply.send({
        user: { id: user.id, email: user.email, createdAt: user.created_at },
      });
    } catch {
      return reply.code(401).send({ user: null });
    }
  });
}
