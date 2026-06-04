// DTDC tracking API client. Uses the production tracking endpoint:
//   POST /dtdc-api/rest/JSONCnTrk/getTrackDetails
//
// Auth: DTDC issues a long-lived "Tracking token" per customer code (format
// "<customer>_trk_json:<hash>"). That value goes into X-Access-Token on every
// request. The /authenticate (username + password → token) flow exists in
// DTDC's docs but isn't needed when you already have a Tracking token, so
// we don't wire it up here.

const DTDC_PROD_BASE = "https://blktracksvc.dtdc.com/dtdc-api";

export type DtdcTrackHeader = {
  strShipmentNo?: string;
  strRefNo?: string;
  strCNType?: string;
  strCNTypeCode?: string;
  strCNTypeName?: string;
  strCNProduct?: string;
  strModeCode?: string;
  strMode?: string;
  strCNProdCODFOD?: string;
  strOrigin?: string;
  strOriginRemarks?: string;
  strBookedDate?: string;        // DDMMYYYY
  strBookedTime?: string;        // HH:MM:SS
  strPieces?: string;
  strWeightUnit?: string;
  strWeight?: string;
  strDestination?: string;
  strStatus?: string;            // DELIVERED / ATTEMPTED / HELDUP / RTO / ...
  strStatusTransOn?: string;     // DDMMYYYY
  strStatusTransTime?: string;   // HHMM
  strStatusRelCode?: string;
  strStatusRelName?: string;
  strRemarks?: string;
  strNoOfAttempts?: string;      // numeric string
  strRtoNumber?: string;
};

export type DtdcTrackEvent = {
  strCode?: string;      // BKD / OBMD / DLV / OUTDLV / etc.
  strAction?: string;    // "Booked", "In Transit", "Delivered", ...
  strManifestNo?: string;
  strOrigin?: string;
  strDestination?: string;
  strActionDate?: string; // DDMMYYYY
  strActionTime?: string; // HHMM
  sTrRemarks?: string;
};

export type DtdcTrackResponse = {
  statusCode: number;
  statusFlag: boolean;
  status: string;
  errorDetails: unknown;
  trackHeader: DtdcTrackHeader | null;
  trackDetails: DtdcTrackEvent[] | null;
};

function envToken(): string {
  return process.env.DTDC_API_TOKEN?.trim() || "";
}

// Single-AWB tracking lookup. Returns the parsed JSON DTDC sends back.
export async function trackAwb(awb: string): Promise<DtdcTrackResponse> {
  const token = envToken();
  if (!token) {
    throw new Error("DTDC_API_TOKEN env var missing — set the Tracking token DTDC emailed you.");
  }
  const url = `${DTDC_PROD_BASE}/rest/JSONCnTrk/getTrackDetails`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trkType: "cnno", strcnno: awb, addtnlDtl: "Y" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DTDC tracking failed for ${awb}: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return (await res.json()) as DtdcTrackResponse;
}

// Parse DTDC's DDMMYYYY + HHMM format into a real Date. Times are IST by
// convention (the DTDC backend runs in India). Returns null when the inputs
// are missing or malformed.
export function parseDtdcDate(dateStr?: string | null, timeStr?: string | null): Date | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const dd = parseInt(dateStr.slice(0, 2), 10);
  const mm = parseInt(dateStr.slice(2, 4), 10);
  const yyyy = parseInt(dateStr.slice(4, 8), 10);
  if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yyyy)) return null;
  let hour = 0;
  let minute = 0;
  if (timeStr) {
    const t = timeStr.padStart(4, "0");
    hour = parseInt(t.slice(0, 2), 10);
    minute = parseInt(t.slice(2, 4), 10);
    if (Number.isNaN(hour)) hour = 0;
    if (Number.isNaN(minute)) minute = 0;
  }
  // Build the UTC instant equivalent to that IST wall-clock time.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const utcMs = Date.UTC(yyyy, mm - 1, dd, hour, minute) - IST_OFFSET_MS;
  return new Date(utcMs);
}
