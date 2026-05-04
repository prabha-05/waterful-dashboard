// Meta Marketing API client.
// Docs: https://developers.facebook.com/docs/marketing-apis/

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN ?? "";
// Strip optional "act_" prefix the user might paste in
const META_AD_ACCOUNT_ID = (process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "");
const META_API_VERSION = process.env.META_API_VERSION ?? "v22.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string; // ACTIVE / PAUSED / DELETED / ARCHIVED
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaInsightRaw {
  campaign_id: string;
  campaign_name: string;
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface PagedResponse<T> {
  data: T[];
  paging?: {
    next?: string;
    cursors?: { before: string; after: string };
  };
}

async function metaFetch<T>(url: string): Promise<PagedResponse<T>> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<PagedResponse<T>>;
}

/**
 * Fetch all campaigns for the configured ad account, handling pagination.
 */
export async function fetchAllCampaigns(): Promise<MetaCampaignRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }

  const fields = [
    "id",
    "name",
    "status",
    "objective",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
    "created_time",
    "updated_time",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/campaigns?fields=${fields}&limit=200&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaCampaignRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaCampaignRaw> = await metaFetch<MetaCampaignRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}

/**
 * Fetch daily insights (spend/impressions/clicks/etc) per campaign for a date range.
 * Returns one row per campaign per day.
 */
export async function fetchDailyInsights(
  since: Date,
  until: Date
): Promise<MetaInsightRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }

  const sinceStr = since.toISOString().slice(0, 10); // YYYY-MM-DD
  const untilStr = until.toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

  const fields = [
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "actions",
    "action_values",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/insights?level=campaign&time_range=${timeRange}&time_increment=1&fields=${fields}&limit=500&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaInsightRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaInsightRaw> = await metaFetch<MetaInsightRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}

// ─── Ad Set level ────────────────────────────────────────────────

export interface MetaAdSetRaw {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  created_time: string;
  updated_time: string;
  targeting?: Record<string, unknown>;
}

export async function fetchAllAdSets(): Promise<MetaAdSetRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }
  const fields = [
    "id",
    "campaign_id",
    "name",
    "status",
    "effective_status",
    "optimization_goal",
    "billing_event",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "end_time",
    "created_time",
    "updated_time",
    "targeting",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/adsets?fields=${fields}&limit=200&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaAdSetRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaAdSetRaw> = await metaFetch<MetaAdSetRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}

export interface MetaAdSetInsightRaw extends MetaInsightRaw {
  adset_id: string;
  adset_name: string;
  frequency?: string;
}

export async function fetchAdSetDailyInsights(
  since: Date,
  until: Date
): Promise<MetaAdSetInsightRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

  const fields = [
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "frequency",
    "actions",
    "action_values",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/insights?level=adset&time_range=${timeRange}&time_increment=1&fields=${fields}&limit=500&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaAdSetInsightRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaAdSetInsightRaw> = await metaFetch<MetaAdSetInsightRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}

// ─── Ad level ────────────────────────────────────────────────────

export interface MetaAdRaw {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  effective_status?: string;
  created_time: string;
  updated_time: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
    image_url?: string;
    video_id?: string;
    object_type?: string;
  };
  preview_shareable_link?: string;
}

export async function fetchAllAds(): Promise<MetaAdRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }
  const fields = [
    "id",
    "adset_id",
    "name",
    "status",
    "effective_status",
    "created_time",
    "updated_time",
    "preview_shareable_link",
    "creative{id,name,title,body,thumbnail_url,image_url,video_id,object_type}",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/ads?fields=${fields}&limit=200&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaAdRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaAdRaw> = await metaFetch<MetaAdRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}

export interface MetaAdInsightRaw extends MetaInsightRaw {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  frequency?: string;
  video_3_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export async function fetchAdDailyInsights(
  since: Date,
  until: Date
): Promise<MetaAdInsightRaw[]> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in .env");
  }
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

  const fields = [
    "ad_id",
    "ad_name",
    "adset_id",
    "campaign_id",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "frequency",
    "actions",
    "action_values",
    "video_p75_watched_actions",
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
  ].join(",");

  let url: string | null =
    `${BASE_URL}/act_${META_AD_ACCOUNT_ID}/insights?level=ad&time_range=${timeRange}&time_increment=1&fields=${fields}&limit=500&access_token=${META_ACCESS_TOKEN}`;

  const all: MetaAdInsightRaw[] = [];
  while (url) {
    const json: PagedResponse<MetaAdInsightRaw> = await metaFetch<MetaAdInsightRaw>(url);
    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return all;
}
