"use client";

import { useState } from "react";
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
    label: "Admin",
    icon: null,
    children: [{ label: "Import Sales CSV", href: "/dashboard/admin/import" }],
  },
];

export function Sidebar({ username }: { username: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const pathname = usePathname();

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const initials = username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className={`flex flex-col bg-white border-r border-neutral-200 h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? "w-[70px]" : "w-[260px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-100">
        <div className={`flex items-center gap-3 ${collapsed ? "hidden" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white text-sm font-bold">
            D
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Dashboard</p>
            <p className="text-xs text-neutral-400">Analytics Hub</p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-400">
            <Search size={16} />
            <span className="text-sm">Search...</span>
          </div>
        </div>
      )}

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
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  {item.icon ? (
                    <item.icon size={18} />
                  ) : (
                    !collapsed && <span className="w-[18px]" />
                  )}
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${openMenus[item.label] ? "rotate-180" : ""}`}
                      />
                    </>
                  )}
                </button>
                {openMenus[item.label] && !collapsed && (
                  <div className="ml-[30px] mt-1 space-y-1">
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
              } ${collapsed ? "justify-center" : ""}`}
            >
              {item.icon ? (
                <item.icon size={18} />
              ) : (
                !collapsed && <span className="w-[18px]" />
              )}
              {!collapsed && (
                <span className="flex-1 text-left">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-neutral-100 px-3 py-3">
        <div
          className={`flex items-center gap-3 px-3 py-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold">
              {initials}
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white" />
          </div>
          {!collapsed && (
            <p className="text-sm font-medium text-neutral-900 truncate flex-1 min-w-0">
              {username}
            </p>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className={`w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
