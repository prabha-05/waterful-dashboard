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
} from "lucide-react";

type NavItem =
  | { label: string; href: string; icon: typeof Home | null; children?: never }
  | { label: string; href?: never; icon: typeof Home | null; children: { label: string; href: string }[] };

const navItems: NavItem[] = [
  {
    label: "Final",
    icon: null,
    children: [
      { label: "Sales", href: "/dashboard/final/sales" },
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
    ],
  },
  {
    label: "Meta",
    icon: null,
    children: [
      { label: "Campaigns", href: "/dashboard/final/meta" },
      { label: "Ad Sets", href: "/dashboard/final/meta/ad-sets" },
      { label: "Ads", href: "/dashboard/final/meta/ads" },
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
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-white border-b border-neutral-200 px-4 py-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg text-neutral-700 hover:bg-neutral-100"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white text-xs font-bold">
            D
          </div>
          <span className="text-sm font-semibold text-neutral-900">Dashboard</span>
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
          flex flex-col bg-white border-r border-neutral-200
          fixed lg:sticky inset-y-0 left-0 z-50 lg:z-auto
          h-screen lg:top-0
          w-[280px] ${desktopWidthClass}
          transition-transform duration-300 lg:transition-[width]
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-100">
          <div className={`flex items-center gap-3 ${collapsed ? "lg:hidden" : ""}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white text-sm font-bold">
              D
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Dashboard</p>
              <p className="text-xs text-neutral-400">Analytics Hub</p>
            </div>
          </div>
          {/* Close button (mobile only) */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-neutral-100 text-neutral-500"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          {/* Collapse button (desktop only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block p-1 rounded hover:bg-neutral-100 text-neutral-400"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Search — hidden when desktop-collapsed */}
        <div className={`px-3 py-3 ${collapsed ? "lg:hidden" : ""}`}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-400">
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

        {/* User */}
        <div className="border-t border-neutral-100 px-3 py-3">
          <div
            className={`flex items-center gap-3 px-3 py-2 ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold">
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white" />
            </div>
            <p className={`text-sm font-medium text-neutral-900 truncate flex-1 min-w-0 ${
              collapsed ? "lg:hidden" : ""
            }`}>
              {username}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors ${
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
