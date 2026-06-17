"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

type ColorKey = "emerald" | "violet" | "blue" | "amber" | "rose";

const COLOR_MAP: Record<
  ColorKey,
  {
    bg: string;
    chip: string;
    text: string;
    ring: string;
    dot: string;
  }
> = {
  emerald: {
    bg: "from-emerald-50 via-teal-50 to-white",
    chip: "bg-emerald-100 text-emerald-600",
    text: "from-emerald-600 to-teal-600",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
  },
  violet: {
    bg: "from-violet-50 via-fuchsia-50 to-white",
    chip: "bg-violet-100 text-violet-600",
    text: "from-violet-600 to-fuchsia-600",
    ring: "ring-violet-200",
    dot: "bg-violet-500",
  },
  blue: {
    bg: "from-sky-50 via-indigo-50 to-white",
    chip: "bg-sky-100 text-sky-600",
    text: "from-sky-600 to-indigo-600",
    ring: "ring-sky-200",
    dot: "bg-sky-500",
  },
  amber: {
    bg: "from-amber-50 via-orange-50 to-white",
    chip: "bg-amber-100 text-amber-600",
    text: "from-amber-600 to-orange-600",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  rose: {
    bg: "from-rose-50 via-pink-50 to-white",
    chip: "bg-rose-100 text-rose-600",
    text: "from-rose-600 to-pink-600",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
  },
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(p);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

export function AnimatedKpiCard({
  label,
  value,
  color,
  icon,
  formatter,
  pulse = false,
  href,
  sublabel,
}: {
  label: string;
  value: number;
  color: ColorKey;
  icon: React.ReactNode;
  formatter?: (v: number) => string;
  pulse?: boolean;
  href?: string;
  sublabel?: string;
}) {
  const c = COLOR_MAP[color];
  const animated = useCountUp(value);
  const display = formatter ? formatter(animated) : animated.toLocaleString();

  const cardInner = (
    <>
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full ${c.chip} opacity-30 blur-2xl`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.chip}`}>
            {icon}
          </div>
          <div className="flex items-center gap-2">
            {pulse && value > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.dot} opacity-75`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
              </span>
            )}
            {href && (
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/70 text-neutral-500 transition-all group-hover:bg-white group-hover:text-neutral-900 group-hover:shadow-sm`}>
                <ArrowUpRight size={14} />
              </span>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          {label}
        </p>
        <p className={`mt-1 bg-gradient-to-r ${c.text} bg-clip-text text-3xl font-bold text-transparent tabular-nums`}>
          {display}
        </p>
        {sublabel && (
          <p className="mt-1 text-[11px] text-neutral-500">{sublabel}</p>
        )}
        {href && (
          <p className="mt-2 text-[11px] font-medium text-neutral-500 group-hover:text-neutral-700">
            View details →
          </p>
        )}
      </div>
    </>
  );

  const base = `group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br ${c.bg} shadow-sm transition-all duration-300`;

  if (href) {
    return (
      <Link
        href={href}
        className={`${base} cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:ring-2 hover:${c.ring}`}
      >
        {cardInner}
      </Link>
    );
  }

  return <div className={base}>{cardInner}</div>;
}
