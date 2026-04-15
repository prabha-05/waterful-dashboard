const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = "2024-01";

interface ShopifyAddress {
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
}

interface ShopifyLineItem {
  id: number;
  title: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  price: string;
  total_discount: string;
  vendor?: string;
  product_id?: number;
}

interface ShopifyCustomer {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface ShopifyOrderRaw {
  id: number;
  order_number: number;
  email?: string;
  customer?: ShopifyCustomer;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status?: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  cancelled_at?: string;
  closed_at?: string;
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
  note?: string;
  tags?: string;
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrderRaw[];
}

function shopifyFetch(endpoint: string): Promise<Response> {
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/${endpoint}`;
  return fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Fetch orders from Shopify, optionally filtering by updated_at_min.
 * Handles pagination via the Link header.
 */
export async function fetchAllOrders(
  sinceDate?: Date,
  limit = 250
): Promise<ShopifyOrderRaw[]> {
  const allOrders: ShopifyOrderRaw[] = [];

  let params = `limit=${limit}&status=any`;
  if (sinceDate) {
    params += `&updated_at_min=${sinceDate.toISOString()}`;
  }

  let nextUrl: string | null = `orders.json?${params}`;

  while (nextUrl) {
    const res = await shopifyFetch(nextUrl);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${text}`);
    }

    const data: ShopifyOrdersResponse = await res.json();
    allOrders.push(...data.orders);

    // Handle pagination via Link header
    const linkHeader = res.headers.get("link");
    nextUrl = null;

    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        // Extract just the path after /admin/api/VERSION/
        const fullUrl = nextMatch[1];
        const apiPath = fullUrl.split(`/admin/api/${API_VERSION}/`)[1];
        if (apiPath) {
          nextUrl = apiPath;
        }
      }
    }
  }

  return allOrders;
}

/**
 * Fetch a count of orders (useful for dashboard stats).
 */
export async function fetchOrderCount(): Promise<number> {
  const res = await shopifyFetch("orders/count.json?status=any");
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  const data = await res.json();
  return data.count;
}
