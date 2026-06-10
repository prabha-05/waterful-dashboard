import argparse
import csv
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# IST = UTC+5:30. The TypeScript route uses IST-aligned day boundaries; we
# convert each input date to the UTC instant that corresponds to IST 00:00
# on that day, so the rows we pull line up exactly with the dashboard.
IST_OFFSET = timedelta(hours=5, minutes=30)


def start_of_ist_day(date_str: str) -> datetime:
    """Parse YYYY-MM-DD and return the UTC instant of IST 00:00 on that date.

    Returned as a NAIVE datetime so it compares cleanly with psycopg2's
    naive datetimes (the Postgres column is `timestamp without time zone`).
    """
    y, m, d = (int(x) for x in date_str.split("-"))
    return datetime(y, m, d, 0, 0) - IST_OFFSET


def format_ist_ymd(dt: datetime) -> str:
    """Display a naive UTC instant as the IST calendar date it falls on."""
    return (dt + IST_OFFSET).strftime("%Y-%m-%d")


def normalize_mobile(raw: Optional[str]) -> str:
    """Match clean_up_file.py's clean_mobile_number():
    strip non-digits, drop a leading '91' country code (handles 12 or 13
    digit forms), drop a leading '0', require exactly 10 digits with the
    first digit in {6,7,8,9} (the real Indian mobile range). Returns ''
    when the value doesn't look like an Indian mobile or contains '@'."""
    if not raw:
        return ""
    s = str(raw).strip()
    if not s or "@" in s:
        return ""
    s = re.sub(r"\D", "", s)
    if len(s) in (12, 13) and s.startswith("91"):
        s = s[2:]
    if len(s) == 11 and s.startswith("0"):
        s = s[1:]
    if len(s) == 10 and s[0] in ("6", "7", "8", "9"):
        return s
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Retention pivot cohort (Python port).")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD (inclusive)")
    parser.add_argument("--pivot", required=True, help="YYYY-MM-DD")
    parser.add_argument("--out", default="-", help="Output path. '-' = stdout. Default '-'.")
    parser.add_argument("--format", default="csv", choices=["csv", "json"],
                        help="Output format. csv (default) or json. The dashboard API consumes json.")
    args = parser.parse_args()

    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set. Add it to .env or your environment.", file=sys.stderr)
        return 1

    start_dt = start_of_ist_day(args.start)
    pivot_dt = start_of_ist_day(args.pivot)
    end_dt = start_of_ist_day(args.end) + timedelta(days=1)  # half-open

    if end_dt <= start_dt:
        print("--end must be on or after --start", file=sys.stderr)
        return 1

    # Delivered-order filter -- matches the rule in clean_up_file.py's
    # is_delivered():
    #   fulfillment_status = 'fulfilled'
    #   cancelled_at IS NULL
    #   tags do NOT include "RTO Delivered" / "RTO Initiated" / "rtorejected"
    # Source of truth for these three fields is the ShopifyOrder table,
    # joined to SalesOrder by orderNumber = orderId. duplicate = 1 keeps
    # one row per order (SalesOrder has multiple rows per order, one per
    # line item).
    #
    # Note: psycopg2 uses %s for parameters, so literal % in SQL must be
    # doubled to %% to avoid being interpreted as a placeholder.
    delivered_join = '''
        INNER JOIN "ShopifyOrder" so ON so."orderNumber" = s."orderId"
    '''
    delivered_where = '''
        s.duplicate = 1
        AND so."fulfillmentStatus" = 'fulfilled'
        AND so."cancelledAt" IS NULL
        AND COALESCE(so.tags, '') !~* 'RTO Delivered|RTO Initiated|rtorejected'
    '''

    conn = psycopg2.connect(db_url)
    conn.set_session(readonly=True)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:

            # -- Step 1: pull every active order in the window ------------
            # We need raw rows (not just aggregates) to find which customers
            # showed up in the window and to remember each customer's most
            # recent in-window order id (used in Step 4).
            cur.execute(
                f'''
                SELECT s."orderId", s."date", s."customerName", s."mobile",
                       s."shopifyCustomerId"
                FROM "SalesOrder" s
                {delivered_join}
                WHERE s."date" >= %s AND s."date" < %s
                  AND {delivered_where}
                ORDER BY s."date" DESC
                ''',
                (start_dt, end_dt),
            )
            in_window_rows = cur.fetchall()

            # -- Step 2: build unique identities from the window ----------
            # Identity is ALWAYS the normalized 10-digit mobile. Customers
            # with no usable phone are skipped (can't be deduplicated).
            # This merges multiple Shopify customer IDs that share a phone
            # into one row -- common when the same person signed up twice
            # with different emails.
            customers: dict[str, dict] = {}
            for row in in_window_rows:
                mob_norm = normalize_mobile(row["mobile"])
                if not mob_norm:
                    continue
                identity = f"mob:{mob_norm}"
                c = customers.get(identity)
                if c is None:
                    customers[identity] = {
                        "identity": identity,
                        "name": row["customerName"],
                        "phone": mob_norm,
                        # cid tracked just for the optional ShopifyOrder
                        # enrichment lookup -- not used to dedupe.
                        "cid": row["shopifyCustomerId"],
                        "raw_mobiles": {row["mobile"]} if row["mobile"] else set(),
                        "orders_in_range": 1,
                        # Iterating newest-first, so the first sight wins
                        # and this stays the most-recent order id.
                        "latest_order_id": row["orderId"],
                    }
                else:
                    c["orders_in_range"] += 1
                    if row["mobile"]:
                        c["raw_mobiles"].add(row["mobile"])

            if not customers:
                _emit_empty(args.out)
                return 0

            # -- Step 3: lifetime + post-pivot aggregates per identity ----
            # Identity is phone-only, so we query by every raw mobile form
            # we've seen for each customer in the window. Orders for
            # "9876543210" stored as "+919876543210" and "9876543210"
            # contribute to the same lifetime totals.
            raw_mobiles = sorted({
                m for c in customers.values()
                for m in c["raw_mobiles"]
            })

            lifetime_by_id: dict[str, dict] = {}
            post_by_id: dict[str, dict] = {}

            def merge_lifetime(key: str, first, last, n, units, revenue):
                cur_row = lifetime_by_id.get(key)
                if cur_row is None:
                    lifetime_by_id[key] = {
                        "first": first, "last": last,
                        "count": n, "units": units, "revenue": revenue,
                    }
                    return
                if first and (cur_row["first"] is None or first < cur_row["first"]):
                    cur_row["first"] = first
                if last and (cur_row["last"] is None or last > cur_row["last"]):
                    cur_row["last"] = last
                cur_row["count"] += n
                cur_row["units"] += units
                cur_row["revenue"] += revenue

            def merge_post(key: str, n, units, revenue):
                cur_row = post_by_id.get(key)
                if cur_row is None:
                    post_by_id[key] = {"count": n, "units": units, "revenue": revenue}
                else:
                    cur_row["count"] += n
                    cur_row["units"] += units
                    cur_row["revenue"] += revenue

            # Lifetime -- by raw mobile. Multiple raw mobile forms can map
            # to the same normalized identity, so we merge them under the
            # normalized key. Joined with ShopifyOrder so the same
            # delivered-only filter applies (fulfilled + not cancelled +
            # no RTO tags).
            if raw_mobiles:
                cur.execute(
                    f'''
                    SELECT s."mobile",
                           MIN(s."date") AS first_date,
                           MAX(s."date") AS last_date,
                           COUNT(*)      AS order_count,
                           COALESCE(SUM(s."qty"), 0)   AS units,
                           COALESCE(SUM(s."total"), 0) AS revenue
                    FROM "SalesOrder" s
                    {delivered_join}
                    WHERE s."mobile" = ANY(%s)
                      AND {delivered_where}
                    GROUP BY s."mobile"
                    ''',
                    (raw_mobiles,),
                )
                for r in cur.fetchall():
                    norm = normalize_mobile(r["mobile"])
                    if not norm:
                        continue
                    merge_lifetime(
                        f"mob:{norm}",
                        r["first_date"], r["last_date"],
                        r["order_count"], r["units"], float(r["revenue"]),
                    )

                cur.execute(
                    f'''
                    SELECT s."mobile",
                           COUNT(*) AS order_count,
                           COALESCE(SUM(s."qty"), 0)   AS units,
                           COALESCE(SUM(s."total"), 0) AS revenue
                    FROM "SalesOrder" s
                    {delivered_join}
                    WHERE s."mobile" = ANY(%s)
                      AND s."date" >= %s
                      AND {delivered_where}
                    GROUP BY s."mobile"
                    ''',
                    (raw_mobiles, pivot_dt),
                )
                for r in cur.fetchall():
                    norm = normalize_mobile(r["mobile"])
                    if not norm:
                        continue
                    merge_post(
                        f"mob:{norm}",
                        r["order_count"], r["units"], float(r["revenue"]),
                    )

            # -- Step 4: enrich with canonical email/name/phone from ------
            #    the customer's latest in-window order in ShopifyOrder.
            # SalesOrder stores name/mobile as entered at order time.
            # ShopifyOrder reflects the customer's most recent contact
            # info -- Shopify updates it on each new checkout. Prefer
            # ShopifyOrder values, fall back to SalesOrder.
            latest_order_ids = [c["latest_order_id"] for c in customers.values()]
            shopify_by_order: dict[int, dict] = {}
            if latest_order_ids:
                cur.execute(
                    '''
                    SELECT "orderNumber", email, "customerName", phone
                    FROM "ShopifyOrder"
                    WHERE "orderNumber" = ANY(%s)
                    ''',
                    (latest_order_ids,),
                )
                for r in cur.fetchall():
                    shopify_by_order[r["orderNumber"]] = {
                        "email": r["email"],
                        "name": r["customerName"],
                        "phone": r["phone"],
                    }

            # -- Step 5: assemble + tag each row --------------------------
            rows = []
            for c in customers.values():
                life = lifetime_by_id.get(c["identity"])
                if life is None:
                    continue  # defensive
                post = post_by_id.get(c["identity"], {"count": 0, "units": 0, "revenue": 0.0})
                shop = shopify_by_order.get(c["latest_order_id"], {})
                shop_phone_norm = normalize_mobile(shop.get("phone"))

                display_name = shop.get("name") or c["name"]
                display_phone = shop_phone_norm or c["phone"]
                email = shop.get("email") or ""

                lifetime_revenue = float(life["revenue"])
                post_revenue = float(post["revenue"])

                rows.append({
                    "Name": display_name,
                    "Phone": display_phone,
                    "Email": email,
                    "Lifetime units": life["units"],
                    "Pre-pivot units": life["units"] - post["units"],
                    "Post-pivot units": post["units"],
                    "Lifetime revenue": round(lifetime_revenue),
                    "Pre-pivot revenue": round(lifetime_revenue - post_revenue),
                    "Post-pivot revenue": round(post_revenue),
                    "Orders in window": c["orders_in_range"],
                    "Lifetime orders": life["count"],
                    "Pre-pivot orders": life["count"] - post["count"],
                    "Post-pivot orders": post["count"],
                    "First order": format_ist_ymd(life["first"]),
                    "First vs pivot": "pre" if life["first"] < pivot_dt else "post",
                    "Last order": format_ist_ymd(life["last"]),
                    "Last vs pivot": "pre" if life["last"] < pivot_dt else "post",
                    # Used only for sort; dropped before writing CSV.
                    "_orders_in_range": c["orders_in_range"],
                    "_name_for_sort": display_name,
                })
    finally:
        conn.close()

    df = pd.DataFrame(rows).sort_values(
        by=["_orders_in_range", "_name_for_sort"],
        ascending=[False, True],
    ).drop(columns=["_orders_in_range", "_name_for_sort"])

    _emit(df, args.out, args.format, args.start, args.end, args.pivot)
    return 0


def _emit(df: "pd.DataFrame", out: str, fmt: str, start: str, end: str, pivot: str) -> None:
    if fmt == "json":
        # Emit shape compatible with /api/retention/pivot (camelCase keys)
        # so the dashboard component can consume it without remapping.
        import json
        customers = []
        for i, d in enumerate(df.to_dict(orient="records"), start=1):
            customers.append({
                # React key; the TS route uses cid:X / mob:X — we synthesise
                # a stable per-row id here so React doesn't warn.
                "identity": f"py:{i}",
                "name": d["Name"],
                "phone": d["Phone"],
                "email": d["Email"] or None,
                "ordersInRange": int(d["Orders in window"]),
                "lifetimeOrders": int(d["Lifetime orders"]),
                "lifetimeUnits": int(d["Lifetime units"]),
                "lifetimeRevenue": float(d["Lifetime revenue"]),
                "firstOrderDate": d["First order"],
                "lastOrderDate": d["Last order"],
                "firstTag": d["First vs pivot"],
                "lastTag": d["Last vs pivot"],
                "postPivotOrders": int(d["Post-pivot orders"]),
                "postPivotUnits": int(d["Post-pivot units"]),
                "postPivotRevenue": float(d["Post-pivot revenue"]),
            })
        payload = {"start": start, "end": end, "pivot": pivot, "customers": customers}
        text = json.dumps(payload, default=str, ensure_ascii=False)
        if out == "-":
            # Windows defaults stdout to cp1252 which can't encode emoji /
            # non-Latin characters that show up in some customer names.
            # Write raw UTF-8 bytes to the underlying buffer instead.
            sys.stdout.buffer.write(text.encode("utf-8"))
        else:
            with open(out, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"Wrote {len(df)} rows to {out}", file=sys.stderr)
        return
    # CSV path — keep the dashboard's "Download CSV" header style.
    if out == "-":
        df.to_csv(sys.stdout, index=False, quoting=csv.QUOTE_NONNUMERIC)
    else:
        df.to_csv(out, index=False, quoting=csv.QUOTE_NONNUMERIC)
        print(f"Wrote {len(df)} rows to {out}", file=sys.stderr)


def _emit_empty(path: str) -> None:
    cols = [
        "Name", "Phone", "Email",
        "Lifetime units", "Pre-pivot units", "Post-pivot units",
        "Lifetime revenue", "Pre-pivot revenue", "Post-pivot revenue",
        "Orders in window", "Lifetime orders",
        "Pre-pivot orders", "Post-pivot orders",
        "First order", "First vs pivot",
        "Last order", "Last vs pivot",
    ]
    df = pd.DataFrame(columns=cols)
    if path == "-":
        df.to_csv(sys.stdout, index=False)
    else:
        df.to_csv(path, index=False)


if __name__ == "__main__":
    sys.exit(main())
