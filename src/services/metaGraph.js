import { config } from "../config.js";

const GRAPH = `https://graph.facebook.com/${config.metaApiVersion}`;

export async function graphGet(path, params) {
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, typeof v === "string" ? v : String(v));
    }
  }
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || "Graph API error");
    err.graphCode = data.error.code;
    err.graphSubcode = data.error.error_subcode;
    throw err;
  }
  return data;
}

export async function exchangeCodeForToken(code, redirectUri) {
  const params = {
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: redirectUri,
    code,
  };
  return graphGet("/oauth/access_token", params);
}

export async function exchangeLongLivedUserToken(shortLivedToken) {
  const params = {
    grant_type: "fb_exchange_token",
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    fb_exchange_token: shortLivedToken,
  };
  return graphGet("/oauth/access_token", params);
}

export async function fetchAllPages(firstUrl) {
  const out = [];
  let url = firstUrl;
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      const err = new Error(data.error.message || "Graph API error");
      throw err;
    }
    if (Array.isArray(data.data)) {
      out.push(...data.data);
    }
    url = data.paging?.next || null;
  }
  return out;
}

export function buildGraphUrl(path, params) {
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(
        k,
        typeof v === "object" ? JSON.stringify(v) : String(v),
      );
    }
  }
  return url.toString();
}
