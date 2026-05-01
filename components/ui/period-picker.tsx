"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Minus, Plus, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const INK = "#4a3a2e";
const AMBER = "#c99954";
const SAGE = "#7a9471";

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
          className="rounded-lg p-1.5 transition-colors hover:bg-neutral-100"
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
          className="rounded-lg p-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
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
                  : { color: INK, background: isFuture ? "transparent" : "#faf6ef" }
              }
              onMouseEnter={(e) => {
                if (!isSelected && !isFuture) e.currentTarget.style.background = `${AMBER}22`;
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isFuture) e.currentTarget.style.background = "#faf6ef";
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
  endDate: Date;
  onCountChange: (n: number) => void;
  onUnitChange: (u: Unit) => void;
  onEndDateChange: (d: Date) => void;
  maxCount?: number;
  trailingLabel?: string;
};

export function PeriodPicker({
  count,
  unit,
  endDate,
  onCountChange,
  onUnitChange,
  onEndDateChange,
  maxCount = 52,
  trailingLabel,
}: Props) {
  const [inputValue, setInputValue] = useState(String(count));
  const [showPicker, setShowPicker] = useState(false);

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

  const pickEndDate = (date: Date | undefined) => {
    if (!date) return;
    onEndDateChange(date);
    setShowPicker(false);
  };

  const pickMonth = (year: number, monthIdx: number) => {
    const today = new Date();
    const lastDay = new Date(year, monthIdx + 1, 0);
    const capped =
      year === today.getFullYear() && monthIdx === today.getMonth() ? today : lastDay;
    onEndDateChange(capped);
    setShowPicker(false);
  };

  const unitLabel = (u: Unit) => ({ day: "Days", week: "Weeks", month: "Months" }[u]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="inline-flex items-center rounded-xl border overflow-hidden"
        style={{ borderColor: "#e8dfd0", background: "white" }}
      >
        <button onClick={dec} className="px-3 py-2.5 transition-colors hover:bg-neutral-50" style={{ color: INK }}>
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
          style={{ color: INK, borderColor: "#e8dfd0" }}
        />
        <button onClick={inc} className="px-3 py-2.5 transition-colors hover:bg-neutral-50" style={{ color: INK }}>
          <Plus size={16} />
        </button>
      </div>

      <div className="inline-flex rounded-xl border overflow-hidden" style={{ borderColor: "#e8dfd0" }}>
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

      <div className="relative inline-block">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-white/80"
          style={{ background: "white", borderColor: "#e8dfd0", color: INK }}
        >
          <Calendar size={16} style={{ color: AMBER }} />
          {unit === "month"
            ? endDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
            : endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </button>
        {showPicker && (
          <div
            className="absolute z-50 mt-2 rounded-xl border p-2 shadow-xl"
            style={{ background: "white", borderColor: "#e8dfd0" }}
          >
            {unit === "month" ? (
              <>
                <MonthGridPicker selectedDate={endDate} onPick={pickMonth} />
                <button
                  onClick={() => { onEndDateChange(new Date()); setShowPicker(false); }}
                  className="mt-1 w-full rounded-lg px-4 py-2 text-xs font-medium text-white"
                  style={{ background: SAGE }}
                >
                  This month
                </button>
              </>
            ) : (
              <>
                <DayPicker
                  mode="single"
                  selected={endDate}
                  onSelect={pickEndDate}
                  endMonth={new Date()}
                  startMonth={new Date(2022, 0)}
                  captionLayout="dropdown"
                />
                <button
                  onClick={() => { onEndDateChange(new Date()); setShowPicker(false); }}
                  className="mt-2 w-full rounded-lg px-4 py-2 text-xs font-medium text-white"
                  style={{ background: SAGE }}
                >
                  Reset to Today
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {trailingLabel !== undefined && (
        <p className="text-sm" style={{ color: "#9a8571" }}>
          <span className="font-bold" style={{ color: INK }}>
            {count} {unitLabel(unit).toLowerCase()}
          </span>{" "}
          {trailingLabel}
        </p>
      )}
    </div>
  );
}
