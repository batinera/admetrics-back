import jwt from "jsonwebtoken";
import { config } from "../config.js";

const PURPOSE = "meta_oauth";

export function buildMetaOAuthState(userId) {
  return jwt.sign({ sub: userId, purpose: PURPOSE }, config.jwtSecret, {
    expiresIn: "10m",
  });
}

export function parseMetaOAuthState(state) {
  const payload = jwt.verify(state, config.jwtSecret);
  if (payload.purpose !== PURPOSE) {
    throw new Error("Invalid OAuth state");
  }
  return { userId: payload.sub };
}

export function metaOAuthRedirectUri() {
  return `${config.publicApiUrl.replace(/\/$/, "")}/integrations/meta/callback`;
}

export function metaAuthorizeUrl(state) {
  const redirectUri = metaOAuthRedirectUri();
  const u = new URL(
    `https://www.facebook.com/${config.metaApiVersion}/dialog/oauth`,
  );
  u.searchParams.set("client_id", config.metaAppId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", "ads_read");
  return u.toString();
}
