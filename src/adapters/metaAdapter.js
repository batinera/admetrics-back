import { buildGraphUrl } from "../services/metaGraph.js";

function sumActions(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((s, a) => s + (parseFloat(a.value, 10) || 0), 0);
}

function formatYMD(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Meta devolve start_time/stop_time como Unix (s) ou string ISO — evita Invalid Date. */
function parseMetaDateTime(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const asNum = Number(s);
  if (!Number.isNaN(asNum) && /^\d+$/.test(s)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveDateRange({ periodDays, since, until, dateRange }) {
  if (since && until) {
    return { since: since.slice(0, 10), until: until.slice(0, 10) };
  }
  if (dateRange?.start && dateRange?.end) {
    return {
      since: String(dateRange.start).slice(0, 10),
      until: String(dateRange.end).slice(0, 10),
    };
  }
  const days = Math.min(Math.max(Number(periodDays) || 30, 1), 90);
  const untilD = new Date();
  const sinceD = new Date(untilD);
  sinceD.setUTCDate(sinceD.getUTCDate() - (days - 1));
  return { since: formatYMD(sinceD), until: formatYMD(untilD) };
}

function previousRange({ since, until }) {
  const s = new Date(`${since}T12:00:00Z`);
  const u = new Date(`${until}T12:00:00Z`);
  const len = Math.round((u.getTime() - s.getTime()) / 86400000) + 1;
  const prevUntil = new Date(s);
  prevUntil.setUTCDate(prevUntil.getUTCDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setUTCDate(prevSince.getUTCDate() - (len - 1));
  return { since: formatYMD(prevSince), until: formatYMD(prevUntil) };
}

function pctChange(current, previous) {
  if (previous == null || Number.isNaN(previous) || previous === 0) {
    return 0;
  }
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

function metricValue(value, prev) {
  return {
    value,
    change: pctChange(value, prev),
  };
}

function mapCampaignStatus(raw) {
  const u = String(raw || "").toLowerCase();
  if (u === "active") return "active";
  if (u === "paused") return "paused";
  if (
    u === "completed" ||
    u === "archived" ||
    u === "deleted" ||
    u === "with_issues"
  ) {
    return "completed";
  }
  return "paused";
}

function budgetFromCampaign(c) {
  const lb = c.lifetime_budget ? parseInt(c.lifetime_budget, 10) / 100 : 0;
  const db = c.daily_budget ? parseInt(c.daily_budget, 10) / 100 : 0;
  if (lb > 0) return lb;
  if (db > 0) return db * 30;
  return 0;
}

async function fetchPagedGraph(url) {
  const rows = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || "Graph API error");
    }
    rows.push(...(data.data || []));
    next = data.paging?.next || null;
  }
  return rows;
}

async function fetchAccountInsight(accessToken, actId, timeRange) {
  const url = buildGraphUrl(`/act_${actId.replace(/^act_/, "")}/insights`, {
    access_token: accessToken,
    level: "account",
    fields: "impressions,reach,spend,clicks,cpm,cpc,frequency,actions",
    time_range: JSON.stringify(timeRange),
  });
  const rows = await fetchPagedGraph(url);
  return rows[0] || null;
}

async function fetchCampaignDailyInsights(
  accessToken,
  actId,
  timeRange,
  campaignIds,
) {
  const id = actId.replace(/^act_/, "");
  const params = {
    access_token: accessToken,
    level: "campaign",
    time_increment: 1,
    fields:
      "campaign_id,campaign_name,impressions,reach,spend,clicks,cpm,cpc,frequency,actions,date_start",
    time_range: JSON.stringify(timeRange),
    limit: 500,
  };
  if (campaignIds?.length) {
    params.filtering = JSON.stringify([
      { field: "campaign.id", operator: "IN", value: campaignIds },
    ]);
  }
  const url = buildGraphUrl(`/act_${id}/insights`, params);
  return fetchPagedGraph(url);
}

async function fetchCampaignsMeta(accessToken, actId) {
  const id = actId.replace(/^act_/, "");
  const url = buildGraphUrl(`/act_${id}/campaigns`, {
    access_token: accessToken,
    fields:
      "id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget",
    limit: 500,
  });
  return fetchPagedGraph(url);
}

function normalizeActId(actId) {
  const s = String(actId).replace(/^act_/, "");
  return `act_${s}`;
}

export async function fetchDashboard(connection, options = {}) {
  const accessToken = connection.accessToken;
  const actId = normalizeActId(connection.selectedAccountId);
  const range = resolveDateRange(options);
  const prev = previousRange(range);
  const campaignIds = options.campaignIds?.length ? options.campaignIds : null;

  const [currAccount, prevAccount, dailyRows, campaignsMeta] =
    await Promise.all([
      fetchAccountInsight(accessToken, actId, range),
      fetchAccountInsight(accessToken, actId, prev),
      fetchCampaignDailyInsights(accessToken, actId, range, campaignIds),
      fetchCampaignsMeta(accessToken, actId),
    ]);

  const filterSet = campaignIds ? new Set(campaignIds) : null;
  const filteredDaily = filterSet
    ? dailyRows.filter((r) => filterSet.has(r.campaign_id))
    : dailyRows;

  const byDate = new Map();
  for (const row of filteredDaily) {
    const d = row.date_start;
    if (!byDate.has(d)) {
      byDate.set(d, {
        date: d,
        results: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        spend: 0,
      });
    }
    const agg = byDate.get(d);
    agg.impressions += parseInt(row.impressions, 10) || 0;
    agg.reach += parseInt(row.reach, 10) || 0;
    agg.clicks += parseInt(row.clicks, 10) || 0;
    agg.spend += parseFloat(row.spend) || 0;
    agg.results += sumActions(row.actions);
  }

  const timeSeriesData = [...byDate.values()]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((day) => {
      const impressions = day.impressions || 0;
      const clicks = day.clicks || 0;
      const spend = day.spend || 0;
      const results = day.results || 0;
      const reach = day.reach || 0;
      return {
        date: day.date,
        results: Math.round(results),
        reach: Math.round(reach),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        spend: parseFloat(spend.toFixed(2)),
        cpm:
          impressions > 0
            ? parseFloat(((spend / impressions) * 1000).toFixed(2))
            : 0,
        costPerResult:
          results > 0 ? parseFloat((spend / results).toFixed(2)) : 0,
        frequency: reach > 0 ? parseFloat((impressions / reach).toFixed(2)) : 0,
        cpc: clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0,
        ctr:
          impressions > 0
            ? parseFloat(((clicks / impressions) * 100).toFixed(2))
            : 0,
        engagement:
          clicks > 0 ? parseFloat(((results / clicks) * 100).toFixed(1)) : 0,
      };
    });

  const campaignTotals = new Map();
  for (const row of filteredDaily) {
    const id = row.campaign_id;
    if (!campaignTotals.has(id)) {
      campaignTotals.set(id, {
        results: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        spend: 0,
      });
    }
    const t = campaignTotals.get(id);
    t.impressions += parseInt(row.impressions, 10) || 0;
    t.reach += parseInt(row.reach, 10) || 0;
    t.clicks += parseInt(row.clicks, 10) || 0;
    t.spend += parseFloat(row.spend) || 0;
    t.results += sumActions(row.actions);
  }

  const campaigns = campaignsMeta.map((c) => {
    const totals = campaignTotals.get(c.id) || {
      results: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      spend: 0,
    };
    const impressions = totals.impressions || 0;
    const reach = totals.reach || 0;
    const clicks = totals.clicks || 0;
    const spend = totals.spend || 0;
    const results = totals.results || 0;
    return {
      id: c.id,
      name: c.name,
      status: mapCampaignStatus(c.status),
      objective: c.objective || "",
      startDate: formatYMD(parseMetaDateTime(c.start_time)),
      endDate: formatYMD(parseMetaDateTime(c.stop_time)),
      budget: budgetFromCampaign(c),
      totals: {
        results: Math.round(results),
        reach: Math.round(reach),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        spend: parseFloat(spend.toFixed(2)),
        frequency: reach > 0 ? parseFloat((impressions / reach).toFixed(2)) : 0,
        cpm:
          impressions > 0
            ? parseFloat(((spend / impressions) * 1000).toFixed(2))
            : 0,
        costPerResult:
          results > 0 ? parseFloat((spend / results).toFixed(2)) : 0,
        budgetRemaining: 0,
        budgetUsedPercent: 0,
      },
    };
  });

  const ca = currAccount || {};
  const pa = prevAccount || {};
  const cImp = parseInt(ca.impressions, 10) || 0;
  const pImp = parseInt(pa.impressions, 10) || 0;
  const cReach = parseInt(ca.reach, 10) || 0;
  const pReach = parseInt(pa.reach, 10) || 0;
  const cClick = parseInt(ca.clicks, 10) || 0;
  const pClick = parseInt(pa.clicks, 10) || 0;
  const cSpend = parseFloat(ca.spend) || 0;
  const pSpend = parseFloat(pa.spend) || 0;
  const cRes = sumActions(ca.actions);
  const pRes = sumActions(pa.actions);

  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalBudget = campaigns
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.budget, 0);

  const freqCurr = cReach > 0 ? cImp / cReach : 0;
  const freqPrev = pReach > 0 ? pImp / pReach : 0;

  const metrics = {
    results: metricValue(Math.round(cRes), pRes),
    reach: metricValue(cReach, pReach),
    frequency: metricValue(parseFloat(freqCurr.toFixed(2)), freqPrev),
    costPerResult: metricValue(
      cRes > 0 ? parseFloat((cSpend / cRes).toFixed(2)) : 0,
      pRes > 0 ? parseFloat((pSpend / pRes).toFixed(2)) : 0,
    ),
    budget: { value: totalBudget, change: 0 },
    spend: metricValue(parseFloat(cSpend.toFixed(2)), pSpend),
    impressions: metricValue(cImp, pImp),
    cpm: metricValue(
      cImp > 0 ? parseFloat(((cSpend / cImp) * 1000).toFixed(2)) : 0,
      pImp > 0 ? parseFloat(((pSpend / pImp) * 1000).toFixed(2)) : 0,
    ),
    clicks: metricValue(cClick, pClick),
    cpc: metricValue(
      cClick > 0 ? parseFloat((cSpend / cClick).toFixed(2)) : 0,
      pClick > 0 ? parseFloat((pSpend / pClick).toFixed(2)) : 0,
    ),
    ctr: metricValue(
      cImp > 0 ? parseFloat(((cClick / cImp) * 100).toFixed(2)) : 0,
      pImp > 0 ? parseFloat(((pClick / pImp) * 100).toFixed(2)) : 0,
    ),
    engagement: metricValue(
      cClick > 0 ? parseFloat(((cRes / cClick) * 100).toFixed(1)) : 0,
      pClick > 0 ? parseFloat(((pRes / pClick) * 100).toFixed(1)) : 0,
    ),
    activeCampaigns,
  };

  return { metrics, timeSeriesData, campaigns };
}
