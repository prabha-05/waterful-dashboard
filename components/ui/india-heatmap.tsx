"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const INDIA_TOPO_URL = "https://raw.githubusercontent.com/udit-001/india-maps-data/main/topojson/india.json";

type HeatmapPoint = {
  city: string;
  state: string;
  lat: number;
  lng: number;
  orderCount: number;
  revenue: number;
  topProduct: string;
  topPincodes: { pincode: string; count: number }[];
};

export function IndiaHeatmap({ points }: { points: HeatmapPoint[] }) {
  const [hovered, setHovered] = useState<HeatmapPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-neutral-50 rounded-lg text-neutral-400 text-sm">
        No orders mapped for this period.
      </div>
    );
  }

  const maxOrders = Math.max(...points.map((p) => p.orderCount), 1);

  const radius = (count: number) => {
    const min = 5;
    const max = 22;
    return min + (max - min) * Math.sqrt(count / maxOrders);
  };

  const sortedCounts = [...points.map((p) => p.orderCount)].sort((a, b) => a - b);
  const percentile = (count: number) => {
    if (points.length <= 1) return 1;
    const idx = sortedCounts.findIndex((v) => v >= count);
    return idx / (sortedCounts.length - 1);
  };

  const HEAT_STOPS: { t: number; color: string }[] = [
    { t: 0, color: "#06b6d4" },
    { t: 0.25, color: "#8b5cf6" },
    { t: 0.5, color: "#ec4899" },
    { t: 0.75, color: "#f59e0b" },
    { t: 1, color: "#ef4444" },
  ];

  const hexToRgb = (h: string) => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  });

  const heatColor = (count: number) => {
    const t = percentile(count);
    for (let i = 1; i < HEAT_STOPS.length; i++) {
      if (t <= HEAT_STOPS[i].t) {
        const a = HEAT_STOPS[i - 1];
        const b = HEAT_STOPS[i];
        const k = (t - a.t) / (b.t - a.t);
        const ca = hexToRgb(a.color);
        const cb = hexToRgb(b.color);
        const r = Math.round(ca.r + (cb.r - ca.r) * k);
        const g = Math.round(ca.g + (cb.g - ca.g) * k);
        const bl = Math.round(ca.b + (cb.b - ca.b) * k);
        return `rgb(${r}, ${g}, ${bl})`;
      }
    }
    return HEAT_STOPS[HEAT_STOPS.length - 1].color;
  };

  return (
    <div
      className="relative w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [82, 22], scale: 900 }}
        width={700}
        height={500}
        style={{ width: "100%", height: "auto" }}
      >
        <defs>
          <linearGradient id="mapFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eef2ff" />
            <stop offset="100%" stopColor="#fdf2f8" />
          </linearGradient>
          <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <Geographies geography={INDIA_TOPO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="url(#mapFill)"
                stroke="#c7d2fe"
                strokeWidth={0.6}
                style={{
                  default: { outline: "none" },
                  hover: { fill: "#e0e7ff", outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>
        {points.map((p, i) => {
          const color = heatColor(p.orderCount);
          const r = radius(p.orderCount);
          return (
            <Marker
              key={i}
              coordinates={[p.lng, p.lat]}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={r * 1.6}
                fill={color}
                fillOpacity={0.18}
              />
              <circle
                r={r}
                fill={color}
                fillOpacity={0.85}
                stroke="#ffffff"
                strokeWidth={1.5}
                filter="url(#dotGlow)"
                style={{ cursor: "pointer" }}
              />
            </Marker>
          );
        })}
      </ComposableMap>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
        <span>Fewer</span>
        <div
          className="h-2 flex-1 max-w-[180px] rounded-full"
          style={{
            background:
              "linear-gradient(to right, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #ef4444)",
          }}
        />
        <span>More orders</span>
      </div>

      {hovered && (
        <div
          className="absolute z-20 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs pointer-events-none min-w-[200px]"
          style={{
            left: Math.min(mousePos.x + 12, 500),
            top: mousePos.y + 12,
          }}
        >
          <p className="font-semibold text-neutral-900">{hovered.city}</p>
          <p className="text-neutral-500 mb-2">{hovered.state}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">Orders</span>
              <span className="font-medium text-neutral-900">{hovered.orderCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">Revenue</span>
              <span className="font-medium text-neutral-900">₹{hovered.revenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">Top product</span>
              <span className="font-medium text-neutral-900 text-right">{hovered.topProduct}</span>
            </div>
            {hovered.topPincodes.length > 0 && (
              <div className="pt-1 mt-1 border-t border-neutral-100">
                <p className="text-neutral-500 mb-1">Top pincodes</p>
                {hovered.topPincodes.map((pc) => (
                  <div key={pc.pincode} className="flex justify-between">
                    <span className="text-neutral-600">{pc.pincode}</span>
                    <span className="text-neutral-900 font-medium">{pc.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
