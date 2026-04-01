import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { integrationRoutes } from "./routes/integrations.js";
import { dashboardRoutes } from "./routes/dashboard.js";

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cookie);
  await fastify.register(cors, {
    origin: config.frontendUrl,
    credentials: true,
  });
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

  fastify.get("/health", async () => ({ ok: true }));

  await fastify.register(authRoutes);
  await fastify.register(integrationRoutes);
  await fastify.register(dashboardRoutes);

  return fastify;
}
