export async function fetchDashboard(_connection, _options) {
  const err = new Error("Integração TikTok Ads ainda não está disponível.");
  err.code = "NOT_IMPLEMENTED";
  err.statusCode = 501;
  throw err;
}
