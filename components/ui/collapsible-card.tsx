"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleCard({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-neutral-50 transition-colors"
      >
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <ChevronDown
          size={18}
          className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}
