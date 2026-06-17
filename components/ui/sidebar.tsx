"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Home,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";
import { WaterfulZeroMark } from "@/components/ui/waterful-logo";

type NavLeaf = { label: string; href: string };
type NavSubGroup = { label: string; href?: never; children: NavLeaf[] };
type NavChild = NavLeaf | NavSubGroup;

// Human-friendly relative time string. "5m ago" / "2h ago" / "3d ago".
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type SyncStatus = {
  shopify: { lastSyncAt: string; status: string } | null;
  meta: { lastSyncAt: string } | null;
};

// Compact status panel that lives in the sidebar footer. Polls /api/sync-status
// once on mount and refreshes every 60s so the relative times stay current.
function SyncStatusPanel({ collapsed }: { collapsed: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/sync-status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // swallow — the widget just won't update
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, []);

  if (collapsed) {
    // When the sidebar is collapsed on desktop, hide details — the user can
    // expand to see them. Show a tiny status dot.
    const ok = (status?.shopify || status?.meta) != null;
    return (
      <div className="hidden lg:flex justify-center py-2">
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-neutral-700"}`}
          title="Sync status"
        />
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-800 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Last sync
        </span>
        <button
          onClick={fetchStatus}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-500"
          aria-label="Refresh sync status"
          title="Refresh"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">Shopify</span>
          <span className="tabular-nums text-neutral-500 truncate" title={status?.shopify?.lastSyncAt ?? "never"}>
            {timeAgo(status?.shopify?.lastSyncAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">Meta</span>
          <span className="tabular-nums text-neutral-500 truncate" title={status?.meta?.lastSyncAt ?? "never"}>
            {timeAgo(status?.meta?.lastSyncAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

type NavItem =
  | { label: string; href: string; icon: typeof Home | null; children?: never }
  | { label: string; href?: never; icon: typeof Home | null; children: NavChild[] };

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/home", icon: Home },
  {
    label: "Shopify",
    icon: null,
    children: [
      { label: "Sales Summary", href: "/dashboard/final/sales" },
      { label: "Trends", href: "/dashboard/final/trends" },
      { label: "Specific Customer", href: "/dashboard/final/specific-customer" },
    ],
  },
  {
    label: "Retention",
    icon: null,
    children: [
      { label: "Overview", href: "/dashboard/final/retention" },
      { label: "Analytics", href: "/dashboard/final/retention-analytics" },
      { label: "Pivot Cohort", href: "/dashboard/final/retention-pivot" },
    ],
  },
  {
    label: "DTDC",
    icon: null,
    children: [
      { label: "Overall Health", href: "/dashboard/dtdc/overall-health" },
      { label: "Needs Attention", href: "/dashboard/dtdc/needs-attention" },
    ],
  },
  {
    label: "Amazon",
    icon: null,
    children: [
      { label: "Sales", href: "/dashboard/amazon/sales" },
    ],
  },
  {
    label: "Meta",
    icon: null,
    children: [
      { label: "Campaigns", href: "/dashboard/final/meta" },
      { label: "Ads", href: "/dashboard/final/meta/ads" },
      {
        label: "Trends",
        children: [
          { label: "Campaigns", href: "/dashboard/final/meta/trends/campaigns" },
          { label: "Ad Sets", href: "/dashboard/final/meta/trends/ad-sets" },
          { label: "Ads", href: "/dashboard/final/meta/trends/ads" },
        ],
      },
    ],
  },
  {
    label: "Admin",
    icon: null,
    children: [{ label: "Import Sales CSV", href: "/dashboard/admin/import" }],
  },
];

export function Sidebar({ username }: { username: string }) {
  // Desktop collapsed state (icons-only) — only relevant on lg+ screens
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer open state — controls visibility on small screens
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const pathname = usePathname();

  // Close mobile drawer when navigating to a new page
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const initials = username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Drawer width — narrower when desktop-collapsed, ignored on mobile
  const desktopWidthClass = collapsed ? "lg:w-[70px]" : "lg:w-[260px]";

  return (
    <>
      {/* Mobile-only top bar with hamburger button.
          Hidden on lg+ (desktop) where the sidebar is always visible. */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-neutral-950 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg text-neutral-300 hover:bg-neutral-800"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <WaterfulZeroMark size={28} />
          <span className="text-sm font-semibold text-white tracking-wide">Waterful Zero</span>
        </div>
        <div className="w-9" /> {/* spacer to balance the hamburger */}
      </div>

      {/* Backdrop — only shown when mobile drawer is open */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
        />
      )}

      {/* Sidebar
          - On mobile: fixed slide-out drawer, w-[280px], transform translates it offscreen when closed
          - On lg+: sticky, behaves like before (collapsed icon mode optional) */}
      <aside
        className={`
          flex flex-col bg-neutral-950 border-r border-neutral-800
          fixed lg:sticky inset-y-0 left-0 z-50 lg:z-auto
          h-screen lg:top-0
          w-[280px] ${desktopWidthClass}
          transition-transform duration-300 lg:transition-[width]
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800">
          {collapsed ? (
            <div className="hidden lg:flex w-full justify-center">
              <WaterfulZeroMark size={32} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <WaterfulZeroMark size={36} />
              <div>
                <p className="text-sm font-semibold text-white tracking-wide">Waterful Zero</p>
                <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Analytics</p>
              </div>
            </div>
          )}
          {/* Close button (mobile only) */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-neutral-800 text-neutral-400"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          {/* Collapse button (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block p-1 rounded hover:bg-neutral-800 text-neutral-500"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Search — hidden when desktop-collapsed */}
        <div className={`px-3 py-3 ${collapsed ? "lg:hidden" : ""}`}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-500">
            <Search size={16} />
            <span className="text-sm">Search...</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.children) {
              const isChildActive = item.children.some((c) => pathname === c.href);
              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isChildActive
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                    } ${collapsed ? "lg:justify-center" : ""}`}
                  >
                    {item.icon ? (
                      <item.icon size={18} />
                    ) : (
                      <span className={`w-[18px] ${collapsed ? "lg:hidden" : ""}`} />
                    )}
                    <span className={`flex-1 text-left ${collapsed ? "lg:hidden" : ""}`}>
                      {item.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${openMenus[item.label] ? "rotate-180" : ""} ${
                        collapsed ? "lg:hidden" : ""
                      }`}
                    />
                  </button>
                  {openMenus[item.label] && (
                    <div className={`ml-[30px] mt-1 space-y-1 ${collapsed ? "lg:hidden" : ""}`}>
                      {item.children.map((child) => {
                        // Nested sub-group (e.g. Meta → Trends → Campaigns/Ad Sets/Ads)
                        if ("children" in child) {
                          const subKey = `${item.label}::${child.label}`;
                          const isSubActive = child.children.some((c) => pathname === c.href);
                          return (
                            <div key={child.label}>
                              <button
                                onClick={() => toggleMenu(subKey)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  isSubActive
                                    ? "bg-neutral-100 text-neutral-900"
                                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                                }`}
                              >
                                <span className="flex-1 text-left">{child.label}</span>
                                <ChevronDown
                                  size={12}
                                  className={`transition-transform ${openMenus[subKey] ? "rotate-180" : ""}`}
                                />
                              </button>
                              {openMenus[subKey] && (
                                <div className="ml-4 mt-1 space-y-1">
                                  {child.children.map((leaf) => {
                                    const isActive = pathname === leaf.href;
                                    return (
                                      <Link
                                        key={leaf.label}
                                        href={leaf.href}
                                        className={`block px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                                          isActive
                                            ? "bg-neutral-100 text-neutral-900"
                                            : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                                        }`}
                                      >
                                        {leaf.label}
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Leaf link
                        const isActive = pathname === child.href;
                        return (
                          <Link
                            key={child.label}
                            href={child.href}
                            className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-neutral-100 text-neutral-900"
                                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href!}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                } ${collapsed ? "lg:justify-center" : ""}`}
              >
                {item.icon ? (
                  <item.icon size={18} />
                ) : (
                  <span className={`w-[18px] ${collapsed ? "lg:hidden" : ""}`} />
                )}
                <span className={`flex-1 text-left ${collapsed ? "lg:hidden" : ""}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Last sync status — Shopify + Meta */}
        <SyncStatusPanel collapsed={collapsed} />

        {/* User */}
        <div className="border-t border-neutral-800 px-3 py-3">
          <div
            className={`flex items-center gap-3 px-3 py-2 ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 text-xs font-semibold">
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-neutral-950" />
            </div>
            <p className={`text-sm font-medium text-neutral-100 truncate flex-1 min-w-0 ${
              collapsed ? "lg:hidden" : ""
            }`}>
              {username}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <LogOut size={18} />
            <span className={`${collapsed ? "lg:hidden" : ""}`}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
