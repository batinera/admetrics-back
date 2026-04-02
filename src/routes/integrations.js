import { authenticate } from "../auth/middleware.js";
import { pool } from "../db/pool.js";
import { encryptJson, decryptJson } from "../crypto.js";
import {
  exchangeCodeForToken,
  exchangeLongLivedUserToken,
  buildGraphUrl,
} from "../services/metaGraph.js";
import {
  buildMetaOAuthState,
  parseMetaOAuthState,
  metaAuthorizeUrl,
  metaOAuthRedirectUri,
} from "../services/metaOAuth.js";
import { assertMetaConfigured, config } from "../config.js";

function mapIntegrationRow(row) {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    selectedAccountId: row.selected_account_id,
    displayName: row.display_name,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getIntegrationForUser(integrationId, userId) {
  const r = await pool.query(
    `SELECT * FROM integrations WHERE id = $1 AND user_id = $2`,
    [integrationId, userId],
  );
  return r.rows[0] || null;
}

export async function integrationRoutes(fastify, _opts) {
  fastify.get(
    "/integrations",
    { preHandler: authenticate },
    async (request, reply) => {
      const r = await pool.query(
        `SELECT id, user_id, provider, status, selected_account_id, display_name,
                error_message, created_at, updated_at
         FROM integrations WHERE user_id = $1 ORDER BY created_at DESC`,
        [request.user.id],
      );
      return reply.send({ integrations: r.rows.map(mapIntegrationRow) });
    },
  );

  fastify.get(
    "/integrations/:provider/connect",
    { preHandler: authenticate },
    async (request, reply) => {
      const { provider } = request.params;
      if (provider === "tiktok" || provider === "google_ads") {
        return reply.code(501).send({
          error: "Esta integração ainda não está disponível.",
          code: "NOT_IMPLEMENTED",
        });
      }
      if (provider !== "meta") {
        return reply.code(400).send({ error: "Fornecedor desconhecido." });
      }
      try {
        assertMetaConfigured();
      } catch (e) {
        return reply
          .code(e.statusCode || 503)
          .send({ error: e.message || "Meta não configurada." });
      }
      const state = buildMetaOAuthState(request.user.id);
      const url = metaAuthorizeUrl(state);
      return reply.redirect(url);
    },
  );

  fastify.get("/integrations/meta/callback", async (request, reply) => {
    const {
      code,
      state,
      error,
      error_description: errorDescription,
    } = request.query;
    const redirectBase = `${config.frontendUrl.replace(/\/$/, "")}/onboarding/meta-callback`;
    if (error) {
      const q = new URLSearchParams({
        error: errorDescription || error || "oauth_failed",
      });
      return reply.redirect(`${redirectBase}?${q}`);
    }
    if (!code || !state) {
      return reply.redirect(
        `${redirectBase}?${new URLSearchParams({ error: "missing_code_or_state" })}`,
      );
    }
    let userId;
    try {
      ({ userId } = parseMetaOAuthState(state));
    } catch {
      return reply.redirect(
        `${redirectBase}?${new URLSearchParams({ error: "invalid_state" })}`,
      );
    }
    try {
      assertMetaConfigured();
    } catch (e) {
      const q = new URLSearchParams({
        error: e.message || "meta_not_configured",
      });
      return reply.redirect(`${redirectBase}?${q}`);
    }
    const redirectUri = metaOAuthRedirectUri();
    let shortTok;
    try {
      const tok = await exchangeCodeForToken(code, redirectUri);
      shortTok = tok.access_token;
      if (!shortTok) {
        throw new Error("No access_token from Meta");
      }
    } catch (e) {
      const q = new URLSearchParams({
        error: e.message || "token_exchange_failed",
      });
      return reply.redirect(`${redirectBase}?${q}`);
    }
    let accessToken = shortTok;
    let expiresAt = null;
    try {
      const longTok = await exchangeLongLivedUserToken(shortTok);
      if (longTok.access_token) {
        accessToken = longTok.access_token;
        if (longTok.expires_in) {
          expiresAt = new Date(Date.now() + longTok.expires_in * 1000);
        }
      }
    } catch {
      /* keep short-lived */
    }
    const encrypted = encryptJson({
      accessToken,
      expiresAt: expiresAt?.toISOString() || null,
    });
    const ins = await pool.query(
      `INSERT INTO integrations (user_id, provider, status, encrypted_credentials)
       VALUES ($1, 'meta', 'pending', $2)
       RETURNING id`,
      [userId, encrypted],
    );
    const integrationId = ins.rows[0].id;
    const q = new URLSearchParams({ integration_id: integrationId });
    return reply.redirect(`${redirectBase}?${q}`);
  });

  fastify.get(
    "/integrations/:id/meta/ad-accounts",
    { preHandler: authenticate },
    async (request, reply) => {
      const row = await getIntegrationForUser(
        request.params.id,
        request.user.id,
      );
      if (!row || row.provider !== "meta") {
        return reply.code(404).send({ error: "Integração não encontrada." });
      }
      let creds;
      try {
        creds = decryptJson(row.encrypted_credentials);
      } catch {
        return reply.code(500).send({ error: "Credenciais inválidas." });
      }
      const url = buildGraphUrl("/me/adaccounts", {
        access_token: creds.accessToken,
        fields: "id,name,account_id",
        limit: 500,
      });
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        return reply.code(502).send({
          error: data.error.message || "Falha ao listar contas Meta.",
        });
      }
      const accounts = (data.data || []).map((a) => ({
        id: a.id,
        name: a.name || a.account_id,
        accountId: a.account_id,
      }));
      return reply.send({ accounts });
    },
  );

  fastify.patch(
    "/integrations/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const row = await getIntegrationForUser(
        request.params.id,
        request.user.id,
      );
      if (!row) {
        return reply.code(404).send({ error: "Integração não encontrada." });
      }
      const { selectedAccountId, displayName } = request.body || {};
      if (!selectedAccountId || typeof selectedAccountId !== "string") {
        return reply
          .code(400)
          .send({ error: "selectedAccountId é obrigatório." });
      }
      const act = selectedAccountId.startsWith("act_")
        ? selectedAccountId
        : `act_${selectedAccountId}`;
      await pool.query(
        `UPDATE integrations SET
          selected_account_id = $1,
          display_name = COALESCE($2, display_name),
          status = 'active',
          error_message = NULL,
          updated_at = NOW()
         WHERE id = $3`,
        [act, displayName || null, row.id],
      );
      const updated = await getIntegrationForUser(row.id, request.user.id);
      return reply.send({ integration: mapIntegrationRow(updated) });
    },
  );

  fastify.delete(
    "/integrations/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const r = await pool.query(
        `DELETE FROM integrations WHERE id = $1 AND user_id = $2 RETURNING id`,
        [request.params.id, request.user.id],
      );
      if (!r.rowCount) {
        return reply.code(404).send({ error: "Integração não encontrada." });
      }
      return reply.send({ ok: true });
    },
  );
}
