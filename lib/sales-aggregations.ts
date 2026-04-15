import { prisma } from "./db";
import { lookupCity } from "./india-cities";

export type CustomerDetail = {
  name: string;
  phone: string;
  city: string;
  pincode: string;
  state: string;
  totalSpent: number;
  orderCount: number;
};

export type OrderDetail = {
  orderId: number;
  customerName: string;
  phone: string;
  product: string;
  qty: number;
  total: number;
  city: string;
  pincode: string;
  state: string;
  status: string;
  paymentMethod: string | null;
};

export type SalesMetrics = {
  totalSales: number;
  totalCustomers: number;
  totalOrders: number;
  rtoCount: number;
  cancelledCount: number;
  top5Orders: {
    customerName: string;
    flavour: string;
    total: number;
    qty: number;
    city: string;
    pincode: string;
  }[];
  paymentDistribution: { method: string; count: number; revenue: number }[];
  productsSold: { product: string; qty: number; revenue: number }[];
  heatmapPoints: {
    city: string;
    state: string;
    lat: number;
    lng: number;
    orderCount: number;
    revenue: number;
    topProduct: string;
    topPincodes: { pincode: string; count: number }[];
  }[];
  stateBreakdown: { state: string; count: number }[];
  cityBreakdown: { city: string; count: number }[];
  unmappedCities: { city: string; count: number }[];
  // Drill-down data
  salesByProduct: { product: string; revenue: number; qty: number; pct: number }[];
  salesByState: { state: string; revenue: number; pct: number }[];
  customers: CustomerDetail[];
  allOrders: OrderDetail[];
  rtoOrders: OrderDetail[];
  cancelledOrders: OrderDetail[];
  statusBreakdown: { status: string; count: number }[];
  rtoByCity: { city: string; count: number }[];
  summaryTable: SummaryTable;
};

export type BuyerSplit = { total: number; firstTime: number; repeat: number };

export type SummaryTable = {
  overallSale: {
    sales: BuyerSplit;
    confirmedOrders: BuyerSplit;
    cancelledOrders: BuyerSplit;
    rto: BuyerSplit;
    aov: BuyerSplit;
    uniqueCustomers: BuyerSplit;
  };
  productSale: { product: string; total: number; firstTime: number; repeat: number }[];
  payment: { method: string; total: number; firstTime: number; repeat: number }[];
  discountCodes: { code: string; total: number; firstTime: number; repeat: number }[];
};

export type ProductDailyPoint = {
  date: string;
  product: string;
  total: number; // orders
  new: number;
  repeat: number;
  qty: number;
};
export type PaymentDailyPoint = {
  date: string;
  method: string;
  total: number; // revenue
  new: number;
  repeat: number;
  orders: number;
};

export async function computeItemDaily(
  startDate: Date,
  endDate: Date,
): Promise<{ productDaily: ProductDailyPoint[]; paymentDaily: PaymentDailyPoint[] }> {
  const rows = await prisma.salesOrder.findMany({
    where: { date: { gte: startDate, lt: endDate }, duplicate: 1 },
    select: { date: true, flavour: true, qty: true, total: true, paymentMethod: true, mobile: true },
  });

  const mobiles = Array.from(new Set(rows.map((o) => o.mobile).filter(Boolean)));
  const earliest = mobiles.length
    ? await prisma.salesOrder.groupBy({
        by: ["mobile"],
        where: { mobile: { in: mobiles } },
        _min: { date: true },
      })
    : [];
  const firstOrderDate = new Map<string, Date>();
  for (const r of earliest) {
    if (r.mobile && r._min.date) firstOrderDate.set(r.mobile, r._min.date);
  }
  const isFT = (m: string) => {
    const d = firstOrderDate.get(m);
    return !!d && d >= startDate && d < endDate;
  };

  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  type ProdBucket = { total: number; new: number; repeat: number; qty: number };
  type PayBucket = { total: number; new: number; repeat: number; orders: number };
  const prodMap = new Map<string, ProdBucket>();
  const payMap = new Map<string, PayBucket>();

  for (const o of rows) {
    const dk = dateKey(o.date);
    const ft = isFT(o.mobile);
    const product = o.flavour || "Unknown";
    const pk = `${dk}|${product}`;
    const pe = prodMap.get(pk) || { total: 0, new: 0, repeat: 0, qty: 0 };
    pe.total += 1;
    pe.qty += o.qty;
    if (ft) pe.new += 1;
    else pe.repeat += 1;
    prodMap.set(pk, pe);

    const method = (o.paymentMethod || "").trim();
    if (method) {
      const mk = `${dk}|${method}`;
      const me = payMap.get(mk) || { total: 0, new: 0, repeat: 0, orders: 0 };
      me.total += o.total;
      me.orders += 1;
      if (ft) me.new += o.total;
      else me.repeat += o.total;
      payMap.set(mk, me);
    }
  }

  const productDaily = Array.from(prodMap.entries())
    .map(([k, v]) => {
      const [date, product] = k.split("|");
      return { date, product, total: v.total, new: v.new, repeat: v.repeat, qty: v.qty };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const paymentDaily = Array.from(payMap.entries())
    .map(([k, v]) => {
      const [date, method] = k.split("|");
      return {
        date,
        method,
        total: Math.round(v.total),
        new: Math.round(v.new),
        repeat: Math.round(v.repeat),
        orders: v.orders,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { productDaily, paymentDaily };
}

export type DailyBreakdownPoint = {
  date: string;
  sales: { total: number; new: number; repeat: number };
  confirmedOrders: { total: number; new: number; repeat: number };
  cancelled: { total: number; new: number; repeat: number };
  rto: { total: number; new: number; repeat: number };
  aov: { total: number; new: number; repeat: number };
  uniqueCustomers: { total: number; new: number; repeat: number };
};

export async function computeDailyBreakdown(
  startDate: Date,
  endDate: Date,
): Promise<DailyBreakdownPoint[]> {
  const [primary, allRaw] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { date: { gte: startDate, lt: endDate }, duplicate: 1 },
      select: { date: true, total: true, mobile: true },
    }),
    prisma.salesOrder.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      select: { date: true, duplicate: true, status: true, mobile: true },
    }),
  ]);

  const mobiles = Array.from(
    new Set([...primary, ...allRaw].map((o) => o.mobile).filter(Boolean)),
  );
  const earliest = mobiles.length
    ? await prisma.salesOrder.groupBy({
        by: ["mobile"],
        where: { mobile: { in: mobiles } },
        _min: { date: true },
      })
    : [];
  const firstOrderDate = new Map<string, Date>();
  for (const r of earliest) {
    if (r.mobile && r._min.date) firstOrderDate.set(r.mobile, r._min.date);
  }
  const isFT = (m: string) => {
    const d = firstOrderDate.get(m);
    return !!d && d >= startDate && d < endDate;
  };

  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  type Bucket = {
    salesT: number; salesN: number; salesR: number;
    confT: number; confN: number; confR: number;
    cancT: number; cancN: number; cancR: number;
    rtoT: number; rtoN: number; rtoR: number;
    mobN: Set<string>; mobR: Set<string>;
  };
  const blank = (): Bucket => ({
    salesT: 0, salesN: 0, salesR: 0,
    confT: 0, confN: 0, confR: 0,
    cancT: 0, cancN: 0, cancR: 0,
    rtoT: 0, rtoN: 0, rtoR: 0,
    mobN: new Set(), mobR: new Set(),
  });
  const days = new Map<string, Bucket>();
  const getDay = (k: string) => {
    let b = days.get(k);
    if (!b) { b = blank(); days.set(k, b); }
    return b;
  };

  for (const o of primary) {
    const b = getDay(dateKey(o.date));
    const ft = isFT(o.mobile);
    b.salesT += o.total;
    if (ft) b.salesN += o.total; else b.salesR += o.total;
    if (o.mobile) (ft ? b.mobN : b.mobR).add(o.mobile);
  }
  for (const o of allRaw) {
    const b = getDay(dateKey(o.date));
    const ft = isFT(o.mobile);
    const isRto = o.status === "RTO" || o.status === "RTO In Transit";
    const isCancel = o.status === "Cancelled";
    if (isRto) { b.rtoT++; if (ft) b.rtoN++; else b.rtoR++; }
    else if (isCancel) { b.cancT++; if (ft) b.cancN++; else b.cancR++; }
    else if (o.duplicate === 1) { b.confT++; if (ft) b.confN++; else b.confR++; }
  }

  return Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      sales: {
        total: Math.round(b.salesT),
        new: Math.round(b.salesN),
        repeat: Math.round(b.salesR),
      },
      confirmedOrders: { total: b.confT, new: b.confN, repeat: b.confR },
      cancelled: { total: b.cancT, new: b.cancN, repeat: b.cancR },
      rto: { total: b.rtoT, new: b.rtoN, repeat: b.rtoR },
      aov: {
        total: b.confT > 0 ? Math.round(b.salesT / b.confT) : 0,
        new: b.confN > 0 ? Math.round(b.salesN / b.confN) : 0,
        repeat: b.confR > 0 ? Math.round(b.salesR / b.confR) : 0,
      },
      uniqueCustomers: {
        total: b.mobN.size + b.mobR.size,
        new: b.mobN.size,
        repeat: b.mobR.size,
      },
    }));
}

export async function computeSalesMetrics(startDate: Date, endDate: Date): Promise<SalesMetrics> {
  const primaryOrders = await prisma.salesOrder.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      duplicate: 1,
    },
  });

  const allRawOrders = await prisma.salesOrder.findMany({
    where: { date: { gte: startDate, lt: endDate } },
  });

  const totalSales = Math.round(primaryOrders.reduce((sum, o) => sum + o.total, 0));
  const totalCustomers = new Set(primaryOrders.map((o) => o.customerName.trim())).size;
  const totalOrders = primaryOrders.length;
  const rtoCount = allRawOrders.filter((o) => o.status === "RTO" || o.status === "RTO In Transit").length;
  const cancelledCount = allRawOrders.filter((o) => o.status === "Cancelled").length;

  const top5Orders = [...primaryOrders]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((o) => ({
      customerName: o.customerName,
      flavour: o.flavour,
      total: Math.round(o.total),
      qty: o.qty,
      city: o.billingCity,
      pincode: o.pincode,
    }));

  // Payment distribution
  const paymentMap = new Map<string, { count: number; revenue: number }>();
  for (const o of primaryOrders) {
    const method = (o.paymentMethod || "").trim();
    if (!method) continue;
    const existing = paymentMap.get(method) || { count: 0, revenue: 0 };
    existing.count++;
    existing.revenue += o.total;
    paymentMap.set(method, existing);
  }
  const paymentDistribution = Array.from(paymentMap.entries())
    .map(([method, d]) => ({ method, count: d.count, revenue: Math.round(d.revenue) }))
    .sort((a, b) => b.count - a.count);

  // Products sold
  const productMap = new Map<string, { qty: number; revenue: number }>();
  for (const o of primaryOrders) {
    const existing = productMap.get(o.flavour) || { qty: 0, revenue: 0 };
    existing.qty += o.qty;
    existing.revenue += o.total;
    productMap.set(o.flavour, existing);
  }
  const productsSold = Array.from(productMap.entries())
    .map(([product, d]) => ({
      product: product.length > 40 ? product.slice(0, 40) + "…" : product,
      qty: d.qty,
      revenue: Math.round(d.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Sales by product (drill-down — with %)
  const salesByProduct = Array.from(productMap.entries())
    .map(([product, d]) => ({
      product: product.length > 35 ? product.slice(0, 35) + "…" : product,
      revenue: Math.round(d.revenue),
      qty: d.qty,
      pct: totalSales > 0 ? Math.round((d.revenue / totalSales) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Sales by state (drill-down — with %)
  const stateRevMap = new Map<string, number>();
  for (const o of primaryOrders) {
    stateRevMap.set(o.billingState, (stateRevMap.get(o.billingState) || 0) + o.total);
  }
  const salesByState = Array.from(stateRevMap.entries())
    .map(([state, revenue]) => ({
      state: state || "Unknown",
      revenue: Math.round(revenue),
      pct: totalSales > 0 ? Math.round((revenue / totalSales) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Heatmap aggregation
  type CityAgg = {
    city: string;
    state: string;
    lat: number;
    lng: number;
    orderCount: number;
    revenue: number;
    productMap: Map<string, number>;
    pincodeMap: Map<string, number>;
  };
  const cityAggMap = new Map<string, CityAgg>();
  const unmappedMap = new Map<string, number>();

  // Pass 1: Learn pincode-prefix → resolved-city map from rows whose billingCity already matches.
  // Pincode first 3 digits identify the sorting district, which maps cleanly to one locale.
  type Coords = { lat: number; lng: number; state: string; cityKey: string; cityDisplay: string };
  const prefixMap = new Map<string, Coords>();
  // Also try to learn the full 6-digit → city for tighter matches across the dataset.
  const fullPinMap = new Map<string, Coords>();
  const learnPin = (pin: string, coords: Coords) => {
    if (!/^\d{6}$/.test(pin)) return;
    fullPinMap.set(pin, coords);
    const prefix = pin.slice(0, 3);
    if (!prefixMap.has(prefix)) prefixMap.set(prefix, coords);
  };

  for (const o of primaryOrders) {
    const coords = lookupCity(o.billingCity);
    if (!coords) continue;
    const key = o.billingCity.trim().toLowerCase();
    const display = o.billingCity.charAt(0).toUpperCase() + o.billingCity.slice(1).toLowerCase();
    if (o.pincode) learnPin(o.pincode, { ...coords, cityKey: key, cityDisplay: display });
  }

  // Pass 2: Aggregate, resolving via billingCity → full-pincode → pincode-prefix → unmapped.
  for (const o of primaryOrders) {
    let resolved: Coords | null = null;
    const direct = lookupCity(o.billingCity);
    if (direct) {
      const key = o.billingCity.trim().toLowerCase();
      const display = o.billingCity.charAt(0).toUpperCase() + o.billingCity.slice(1).toLowerCase();
      resolved = { ...direct, cityKey: key, cityDisplay: display };
    } else if (o.pincode) {
      resolved = fullPinMap.get(o.pincode) || prefixMap.get(o.pincode.slice(0, 3)) || null;
    }

    if (!resolved) {
      const name = o.billingCity.trim();
      if (name) unmappedMap.set(name, (unmappedMap.get(name) || 0) + 1);
      continue;
    }

    if (!cityAggMap.has(resolved.cityKey)) {
      cityAggMap.set(resolved.cityKey, {
        city: resolved.cityDisplay,
        state: resolved.state,
        lat: resolved.lat,
        lng: resolved.lng,
        orderCount: 0,
        revenue: 0,
        productMap: new Map(),
        pincodeMap: new Map(),
      });
    }
    const agg = cityAggMap.get(resolved.cityKey)!;
    agg.orderCount++;
    agg.revenue += o.total;
    agg.productMap.set(o.flavour, (agg.productMap.get(o.flavour) || 0) + 1);
    if (o.pincode) agg.pincodeMap.set(o.pincode, (agg.pincodeMap.get(o.pincode) || 0) + 1);
  }

  const heatmapPoints = Array.from(cityAggMap.values())
    .map((agg) => {
      const topProduct = Array.from(agg.productMap.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] || "—";
      const topPincodes = Array.from(agg.pincodeMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([pincode, count]) => ({ pincode, count }));
      return {
        city: agg.city,
        state: agg.state,
        lat: agg.lat,
        lng: agg.lng,
        orderCount: agg.orderCount,
        revenue: Math.round(agg.revenue),
        topProduct: topProduct.length > 30 ? topProduct.slice(0, 30) + "…" : topProduct,
        topPincodes,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount);

  const unmappedCities = Array.from(unmappedMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // State + City breakdowns
  const stateMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  for (const o of primaryOrders) {
    stateMap.set(o.billingState, (stateMap.get(o.billingState) || 0) + 1);
    const city = o.billingCity.charAt(0).toUpperCase() + o.billingCity.slice(1).toLowerCase();
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
  }
  const stateBreakdown = Array.from(stateMap.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Customer drill-down
  const customerMap = new Map<string, CustomerDetail>();
  for (const o of primaryOrders) {
    const name = o.customerName.trim();
    if (!customerMap.has(name)) {
      customerMap.set(name, {
        name,
        phone: o.mobile,
        city: o.billingCity,
        pincode: o.pincode,
        state: o.billingState,
        totalSpent: 0,
        orderCount: 0,
      });
    }
    const c = customerMap.get(name)!;
    c.totalSpent += o.total;
    c.orderCount++;
  }
  const customers = Array.from(customerMap.values())
    .map((c) => ({ ...c, totalSpent: Math.round(c.totalSpent) }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // All orders drill-down (primary rows only, with full detail)
  const allOrders: OrderDetail[] = primaryOrders.map((o) => ({
    orderId: o.orderId,
    customerName: o.customerName,
    phone: o.mobile,
    product: o.flavour,
    qty: o.qty,
    total: Math.round(o.total),
    city: o.billingCity,
    pincode: o.pincode,
    state: o.billingState,
    status: o.status,
    paymentMethod: o.paymentMethod,
  }));

  // Value estimation for RTO / Cancelled rows (where CSV sets total=0 and often qty=0).
  // Priority: (1) same customer + same flavour history, (2) same customer any flavour,
  // (3) global period flavour average, (4) global period average order value.
  const lossyRows = allRawOrders.filter(
    (o) => (o.status === "RTO" || o.status === "RTO In Transit" || o.status === "Cancelled") && o.total <= 0
  );
  const lossyMobiles = Array.from(new Set(lossyRows.map((o) => o.mobile).filter(Boolean)));

  const customerHistory = lossyMobiles.length
    ? await prisma.salesOrder.findMany({
        where: { mobile: { in: lossyMobiles }, total: { gt: 0 } },
        select: { mobile: true, flavour: true, qty: true, total: true },
      })
    : [];

  const custFlavourPrice = new Map<string, number>();
  const custAnyPrice = new Map<string, number>();
  const custFlavAgg = new Map<string, { rev: number; qty: number }>();
  const custAnyAgg = new Map<string, { rev: number; qty: number }>();
  for (const h of customerHistory) {
    if (h.qty <= 0) continue;
    const fk = `${h.mobile}|${h.flavour}`;
    const fa = custFlavAgg.get(fk) || { rev: 0, qty: 0 };
    fa.rev += h.total;
    fa.qty += h.qty;
    custFlavAgg.set(fk, fa);
    const aa = custAnyAgg.get(h.mobile) || { rev: 0, qty: 0 };
    aa.rev += h.total;
    aa.qty += h.qty;
    custAnyAgg.set(h.mobile, aa);
  }
  for (const [k, a] of custFlavAgg) custFlavourPrice.set(k, a.rev / a.qty);
  for (const [k, a] of custAnyAgg) custAnyPrice.set(k, a.rev / a.qty);

  const flavourAgg = new Map<string, { rev: number; qty: number }>();
  let globalRev = 0;
  let globalQty = 0;
  for (const o of primaryOrders) {
    if (o.total <= 0 || o.qty <= 0) continue;
    const a = flavourAgg.get(o.flavour) || { rev: 0, qty: 0 };
    a.rev += o.total;
    a.qty += o.qty;
    flavourAgg.set(o.flavour, a);
    globalRev += o.total;
    globalQty += o.qty;
  }
  const flavourPrice = new Map<string, number>();
  for (const [f, a] of flavourAgg) flavourPrice.set(f, a.rev / a.qty);
  const globalUnitPrice = globalQty > 0 ? globalRev / globalQty : 0;

  const estimateTotal = (o: (typeof allRawOrders)[number]) => {
    if (o.total > 0) return Math.round(o.total);
    const qty = o.qty > 0 ? o.qty : 1;
    const unit =
      custFlavourPrice.get(`${o.mobile}|${o.flavour}`) ??
      custAnyPrice.get(o.mobile) ??
      flavourPrice.get(o.flavour) ??
      globalUnitPrice;
    return Math.round(unit * qty);
  };

  // RTO and Cancelled from allRawOrders (to get any line, not just primary)
  const rtoOrders: OrderDetail[] = allRawOrders
    .filter((o) => o.status === "RTO" || o.status === "RTO In Transit")
    .map((o) => ({
      orderId: o.orderId,
      customerName: o.customerName,
      phone: o.mobile,
      product: o.flavour,
      qty: o.qty,
      total: estimateTotal(o),
      city: o.billingCity,
      pincode: o.pincode,
      state: o.billingState,
      status: o.status,
      paymentMethod: o.paymentMethod,
    }));

  const cancelledOrders: OrderDetail[] = allRawOrders
    .filter((o) => o.status === "Cancelled")
    .map((o) => ({
      orderId: o.orderId,
      customerName: o.customerName,
      phone: o.mobile,
      product: o.flavour,
      qty: o.qty,
      total: estimateTotal(o),
      city: o.billingCity,
      pincode: o.pincode,
      state: o.billingState,
      status: o.status,
      paymentMethod: o.paymentMethod,
    }));

  // Status breakdown (all statuses)
  const statusMap = new Map<string, number>();
  for (const o of allRawOrders) {
    statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
  }
  const statusBreakdown = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status: status || "Unknown", count }))
    .sort((a, b) => b.count - a.count);

  // RTO hotspots
  const rtoCityMap = new Map<string, number>();
  for (const o of rtoOrders) {
    const city = o.city.charAt(0).toUpperCase() + o.city.slice(1).toLowerCase();
    rtoCityMap.set(city, (rtoCityMap.get(city) || 0) + 1);
  }
  const rtoByCity = Array.from(rtoCityMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // First-time vs repeat buyer classification.
  // A customer (by mobile) is "first-time" in this period if their first-ever order
  // in the whole dataset falls inside [startDate, endDate).
  const periodMobiles = Array.from(
    new Set(allRawOrders.map((o) => o.mobile).filter(Boolean))
  );
  const earliestByMobile = periodMobiles.length
    ? await prisma.salesOrder.groupBy({
        by: ["mobile"],
        where: { mobile: { in: periodMobiles } },
        _min: { date: true },
      })
    : [];
  const firstOrderDate = new Map<string, Date>();
  for (const row of earliestByMobile) {
    if (row.mobile && row._min.date) firstOrderDate.set(row.mobile, row._min.date);
  }
  const isFirstTime = (mobile: string) => {
    const d = firstOrderDate.get(mobile);
    return !!d && d >= startDate && d < endDate;
  };

  const makeSplit = (): BuyerSplit => ({ total: 0, firstTime: 0, repeat: 0 });
  const bump = (s: BuyerSplit, v: number, firstTime: boolean) => {
    s.total += v;
    if (firstTime) s.firstTime += v;
    else s.repeat += v;
  };

  const sales = makeSplit();
  const confirmedOrders = makeSplit();
  const cancelledOrdersSplit = makeSplit();
  const rtoSplit = makeSplit();
  const firstTimeMobiles = new Set<string>();
  const repeatMobiles = new Set<string>();

  for (const o of primaryOrders) {
    const ft = isFirstTime(o.mobile);
    bump(sales, o.total, ft);
    if (o.mobile) (ft ? firstTimeMobiles : repeatMobiles).add(o.mobile);
  }
  for (const o of allRawOrders) {
    const ft = isFirstTime(o.mobile);
    const isRto = o.status === "RTO" || o.status === "RTO In Transit";
    const isCancel = o.status === "Cancelled";
    if (isRto) bump(rtoSplit, 1, ft);
    else if (isCancel) bump(cancelledOrdersSplit, 1, ft);
    else if (o.duplicate === 1) bump(confirmedOrders, 1, ft);
  }

  const aov: BuyerSplit = {
    total: confirmedOrders.total > 0 ? Math.round(sales.total / confirmedOrders.total) : 0,
    firstTime:
      confirmedOrders.firstTime > 0 ? Math.round(sales.firstTime / confirmedOrders.firstTime) : 0,
    repeat: confirmedOrders.repeat > 0 ? Math.round(sales.repeat / confirmedOrders.repeat) : 0,
  };

  const uniqueCustomers: BuyerSplit = {
    total: firstTimeMobiles.size + repeatMobiles.size,
    firstTime: firstTimeMobiles.size,
    repeat: repeatMobiles.size,
  };

  // Product sale (order counts by flavour × buyer type)
  const prodMap = new Map<string, { total: number; firstTime: number; repeat: number }>();
  for (const o of primaryOrders) {
    const key = o.flavour || "Unknown";
    const ft = isFirstTime(o.mobile);
    const e = prodMap.get(key) || { total: 0, firstTime: 0, repeat: 0 };
    e.total++;
    if (ft) e.firstTime++;
    else e.repeat++;
    prodMap.set(key, e);
  }
  const productSale = Array.from(prodMap.entries())
    .map(([product, v]) => ({ product, ...v }))
    .sort((a, b) => b.total - a.total);

  // Payment (revenue by method × buyer type)
  const payMap = new Map<string, { total: number; firstTime: number; repeat: number }>();
  for (const o of primaryOrders) {
    const method = (o.paymentMethod || "").trim();
    if (!method) continue;
    const ft = isFirstTime(o.mobile);
    const e = payMap.get(method) || { total: 0, firstTime: 0, repeat: 0 };
    e.total += o.total;
    if (ft) e.firstTime += o.total;
    else e.repeat += o.total;
    payMap.set(method, e);
  }
  const payment = Array.from(payMap.entries())
    .map(([method, v]) => ({
      method,
      total: Math.round(v.total),
      firstTime: Math.round(v.firstTime),
      repeat: Math.round(v.repeat),
    }))
    .sort((a, b) => b.total - a.total);

  const summaryTable: SummaryTable = {
    overallSale: {
      sales: {
        total: Math.round(sales.total),
        firstTime: Math.round(sales.firstTime),
        repeat: Math.round(sales.repeat),
      },
      confirmedOrders,
      cancelledOrders: cancelledOrdersSplit,
      rto: rtoSplit,
      aov,
      uniqueCustomers,
    },
    productSale,
    payment,
    discountCodes: [],
  };

  return {
    totalSales,
    totalCustomers,
    totalOrders,
    rtoCount,
    cancelledCount,
    top5Orders,
    paymentDistribution,
    productsSold,
    heatmapPoints,
    stateBreakdown,
    cityBreakdown,
    unmappedCities,
    salesByProduct,
    salesByState,
    customers,
    allOrders,
    rtoOrders,
    cancelledOrders,
    statusBreakdown,
    rtoByCity,
    summaryTable,
  };
}
