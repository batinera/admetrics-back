import * as metaAdapter from "./metaAdapter.js";
import * as tiktokAdapter from "./tiktokAdapter.js";
import * as googleAdapter from "./googleAdapter.js";

export async function fetchDashboardForProvider(provider, connection, options) {
  switch (provider) {
    case "meta":
      return metaAdapter.fetchDashboard(connection, options);
    case "tiktok":
      return tiktokAdapter.fetchDashboard(connection, options);
    case "google_ads":
      return googleAdapter.fetchDashboard(connection, options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export { metaAdapter };
