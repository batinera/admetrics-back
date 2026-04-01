# AdMetrics — API (backend)

API Fastify para o dashboard AdMetrics: autenticação, integrações (Meta Ads) e métricas. O frontend vive no repositório separado **admetrics** (Vue + Vite).

## Requisitos

- Node.js 18+
- PostgreSQL

## Configuração

Copia `.env.example` para `.env` e preenche os valores.

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (default `3001`) |
| `DATABASE_URL` | Connection string Postgres |
| `JWT_SECRET` | Segredo para assinar JWT |
| `ENCRYPTION_KEY` | Base64 de 32 bytes (tokens em repouso) |
| `META_APP_ID` / `META_APP_SECRET` | OAuth Meta (opcional até configurares Ads) |
| `META_API_VERSION` | Versão da Graph API (ex. `v21.0`) |
| `PUBLIC_API_URL` | URL pública desta API (ex. `https://api.teudominio.com`) — usada no `redirect_uri` do OAuth Meta |
| `FRONTEND_URL` | URL exata do front (CORS e redirects pós-login OAuth), ex. `http://localhost:5173` ou `https://app.teudominio.com` |

### Integração com o front

- **Desenvolvimento:** corre esta API na porta `3001`. No repo do front, o Vite faz proxy de `/auth`, `/integrations`, `/api` e `/health` para `localhost:3001`; deixa `VITE_API_BASE_URL` vazio.
- **Produção:** no front define `VITE_API_BASE_URL` com a URL pública desta API (sem barra final). Aqui defines `FRONTEND_URL` com a URL pública do front.

Na [Meta for Developers](https://developers.facebook.com/), em **Valid OAuth Redirect URIs**, inclui:

`{PUBLIC_API_URL}/integrations/meta/callback`

### CORS e vários ambientes

O servidor aceita uma única origem (`FRONTEND_URL`). Para Vercel Preview e produção em simultâneo, será preciso evoluir para múltiplas origens (por exemplo variável `ALLOWED_ORIGINS` separada por vírgulas).

## Comandos

```bash
npm install
npm run migrate   # aplica schema em DATABASE_URL
npm run dev       # hot reload (node --watch)
npm start         # produção
```

## Estrutura

- `src/index.js` — entrada
- `src/app.js` — Fastify, CORS, rotas
- `src/routes/` — auth, integrations, dashboard
- `src/db/` — pool, migrações, `schema.sql`

## Licença

MIT (alinhada ao projeto AdMetrics).
