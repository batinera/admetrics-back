import { authenticate } from "../auth/middleware.js";
import { pool } from "../db/pool.js";
import { decryptJson } from "../crypto.js";
import { fetchDashboardForProvider } from "../adapters/index.js";

async function getIntegrationForUser(integrationId, userId) {
  const r = await pool.query(
    `SELECT * FROM integrations WHERE id = $1 AND user_id = $2`,
    [integrationId, userId],
  );
  return r.rows[0] || null;
}

export async function dashboardRoutes(fastify, _opts) {
  fastify.get(
    "/api/dashboard",
    { preHandler: authenticate },
    async (request, reply) => {
      const {
        integrationId,
        period,
        since,
        until,
        campaignIds,
        dateRangeStart,
        dateRangeEnd,
      } = request.query;

      if (!integrationId) {
        return reply.code(400).send({ error: "integrationId é obrigatório." });
      }

      const row = await getIntegrationForUser(integrationId, request.user.id);
      if (!row) {
        return reply.code(404).send({ error: "Integração não encontrada." });
      }
      if (row.status !== "active" || !row.selected_account_id) {
        return reply.code(400).send({
          error: "Integração inativa ou sem conta de anúncios selecionada.",
        });
      }

      let creds;
      try {
        creds = decryptJson(row.encrypted_credentials);
      } catch {
        return reply.code(500).send({ error: "Credenciais inválidas." });
      }

      const campaignIdList =
        typeof campaignIds === "string" && campaignIds.length > 0
          ? campaignIds
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const dateRange =
        dateRangeStart && dateRangeEnd
          ? { start: dateRangeStart, end: dateRangeEnd }
          : null;

      const options = {
        periodDays: period || "30",
        since: since || null,
        until: until || null,
        dateRange,
        campaignIds: campaignIdList,
      };

      const connection = {
        accessToken: creds.accessToken,
        selectedAccountId: row.selected_account_id,
      };

      try {
        const data = await fetchDashboardForProvider(
          row.provider,
          connection,
          options,
        );
        return reply.send(data);
      } catch (e) {
        const code = e.statusCode || e.graphCode || 502;
        request.log.error(e);
        return reply.code(code >= 400 && code < 600 ? code : 502).send({
          error: e.message || "Falha ao obter métricas.",
        });
      }
    },
  );
}
