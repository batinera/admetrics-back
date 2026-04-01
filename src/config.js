import "dotenv/config";

function requireEnv(name, fallback = null) {
  const v = process.env[name] ?? fallback;
  if (v === null || v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  encryptionKeyB64: requireEnv("ENCRYPTION_KEY"),
  metaAppId: process.env.META_APP_ID || "",
  metaAppSecret: process.env.META_APP_SECRET || "",
  metaApiVersion: process.env.META_API_VERSION || "v21.0",
  publicApiUrl: process.env.PUBLIC_API_URL || "http://localhost:3001",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
};

export function assertMetaConfigured() {
  if (!config.metaAppId || !config.metaAppSecret) {
    const err = new Error(
      "Meta OAuth is not configured (META_APP_ID / META_APP_SECRET).",
    );
    err.statusCode = 503;
    throw err;
  }
}
