import { verifySession, COOKIE_NAME } from "./jwt.js";

export async function authenticate(request, reply) {
  const header = request.headers.authorization;
  const bearer =
    header && header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer || request.cookies[COOKIE_NAME];
  if (!token) {
    return reply.code(401).send({ error: "Não autenticado" });
  }
  try {
    const payload = verifySession(token);
    request.user = { id: payload.sub, email: payload.email };
  } catch {
    return reply.code(401).send({ error: "Sessão inválida" });
  }
}
