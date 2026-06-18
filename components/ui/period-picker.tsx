"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const INK = "#ffffff";
const AMBER = "#f97316";
const SAGE = "#10b981";
const BORDER = "#1e293b";
const CREAM_BG = "#0f172a";

export const UNITS = ["day", "week", "month"] as const;
export type Unit = (typeof UNITS)[number];

export function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MonthGridPicker({
  selectedDate,
  onPick,
}: {
  selectedDate: Date;
  onPick: (year: number, monthIdx: number) => void;
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth();
  return (
    <div className="w-64 p-2">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setViewYear((y) => y - 1)}
          className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
          style={{ color: INK }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold tabular-nums" style={{ color: INK }}>
          {viewYear}
        </span>
        <button
          onClick={() => setViewYear((y) => Math.min(y + 1, currentYear))}
          disabled={viewYear >= currentYear}
          className="rounded-lg p-1.5 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ color: INK }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {months.map((m, idx) => {
          const isFuture =
            viewYear > currentYear ||
            (viewYear === currentYear && idx > currentMonth);
          const isSelected = viewYear === selectedYear && idx === selectedMonth;
          return (
            <button
              key={m}
              disabled={isFuture}
              onClick={() => onPick(viewYear, idx)}
              className="rounded-lg px-2 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              style={
                isSelected
                  ? { background: INK, color: "white" }
                  : { color: INK, background: isFuture ? "transparent" : CREAM_BG }
              }
              onMouseEnter={(e) => {
                if (!isSelected && !isFuture) e.currentTarget.style.background = `${AMBER}22`;
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isFuture) e.currentTarget.style.background = CREAM_BG;
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  count: number;
  unit: Unit;
  startDate: Date;
  onCountChange: (n: number) => void;
  onUnitChange: (u: Unit) => void;
  onStartDateChange: (d: Date) => void;
  maxCount?: number;
  trailingLabel?: string;
};

export function PeriodPicker({
  count,
  unit,
  startDate,
  onCountChange,
  onUnitChange,
  onStartDateChange,
  maxCount = 52,
  trailingLabel,
}: Props) {
  const [inputValue, setInputValue] = useState(String(count));
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  useEffect(() => {
    setInputValue(String(count));
  }, [count]);

  const commit = (v: number) => {
    const clamped = Math.min(Math.max(isNaN(v) ? 1 : v, 1), maxCount);
    onCountChange(clamped);
    setInputValue(String(clamped));
  };

  const inc = () => commit(count + 1);
  const dec = () => commit(count - 1);

  const todayYmd = formatDateParam(new Date());
  const startYmd = formatDateParam(startDate);

  const onDateInputChange = (value: string) => {
    if (!value) return;
    // value is YYYY-MM-DD — parse as local-time midnight
    const [y, m, d] = value.split("-").map((s) => parseInt(s, 10));
    onStartDateChange(new Date(y, m - 1, d));
  };

  const pickMonth = (year: number, monthIdx: number) => {
    const today = new Date();
    const lastDay = new Date(year, monthIdx + 1, 0);
    const capped =
      year === today.getFullYear() && monthIdx === today.getMonth() ? today : lastDay;
    onStartDateChange(capped);
    setShowMonthPicker(false);
  };

  const unitLabel = (u: Unit) => ({ day: "Days", week: "Weeks", month: "Months" }[u]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="inline-flex items-center rounded-xl border overflow-hidden"
        style={{ borderColor: "#1e293b", background: "#0f172a" }}
      >
        <button onClick={dec} className="px-3 py-2.5 transition-colors hover:bg-slate-900" style={{ color: INK }}>
          <Minus size={16} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ""))}
          onBlur={() => commit(parseInt(inputValue))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(parseInt(inputValue));
          }}
          className="w-14 py-2.5 text-sm font-bold tabular-nums text-center border-x outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={{ color: INK, borderColor: "#1e293b" }}
        />
        <button onClick={inc} className="px-3 py-2.5 transition-colors hover:bg-slate-900" style={{ color: INK }}>
          <Plus size={16} />
        </button>
      </div>

      <div className="inline-flex rounded-xl border overflow-hidden" style={{ borderColor: "#1e293b" }}>
        {UNITS.map((u) => (
          <button
            key={u}
            onClick={() => onUnitChange(u)}
            className="px-4 py-2.5 text-sm font-medium transition-colors capitalize"
            style={{
              background: unit === u ? INK : "white",
              color: unit === u ? "white" : INK,
            }}
          >
            {u}
          </button>
        ))}
      </div>

      {unit === "month" ? (
        <div className="relative inline-block">
          <button
            onClick={() => setShowMonthPicker(!showMonthPicker)}
            className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-slate-900/80"
            style={{ background: "#0f172a", borderColor: BORDER, color: INK }}
          >
            <Calendar size={16} style={{ color: AMBER }} />
            {startDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
          </button>
          {showMonthPicker && (
            <div
              className="absolute z-50 mt-2 rounded-xl border p-2 shadow-xl"
              style={{ background: "#0f172a", borderColor: BORDER }}
            >
              <MonthGridPicker selectedDate={startDate} onPick={pickMonth} />
              <button
                onClick={() => { onStartDateChange(new Date()); setShowMonthPicker(false); }}
                className="mt-1 w-full rounded-lg px-4 py-2 text-xs font-medium text-white"
                style={{ background: SAGE }}
              >
                This month
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="inline-flex items-center gap-2">
          <Calendar size={14} style={{ color: AMBER }} />
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
            Date
          </label>
          <input
            type="date"
            value={startYmd}
            max={todayYmd}
            onChange={(e) => onDateInputChange(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            style={{ borderColor: BORDER, color: INK, background: CREAM_BG }}
          />
        </div>
      )}

      {trailingLabel !== undefined && (
        <p className="text-sm" style={{ color: "#94a3b8" }}>
          <span className="font-bold" style={{ color: INK }}>
            {count} {unitLabel(unit).toLowerCase()}
          </span>{" "}
          {trailingLabel}
        </p>
      )}
    </div>
  );
}
