"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  LightBulbIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";

const nav = [
  { label: "Dashboard", href: "/", icon: HomeIcon },
  { label: "Interviews", href: "/interviews", icon: ChatBubbleLeftRightIcon },
  { label: "Ideas", href: "/ideas", icon: LightBulbIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const onOpen = () => setMobileOpen(true);
    const onClose = () => setMobileOpen(false);
    window.addEventListener("sidebar:open", onOpen);
    window.addEventListener("sidebar:close", onClose);
    return () => {
      window.removeEventListener("sidebar:open", onOpen);
      window.removeEventListener("sidebar:close", onClose);
    };
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem("sidebar_collapsed");
      if (v === "1") setCollapsed(true);
      if (v === "0") setCollapsed(false);
    } catch {}
    setHydrated(true);
    // run once on mount
  }, []);

  useEffect(() => {
    if (!hydrated) return; // avoid racing the init read
    try {
      localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, hydrated]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (active) setUserEmail(data.user?.email ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      try {
        localStorage.removeItem("idea_slug");
        localStorage.removeItem("sidebar_collapsed");
        localStorage.removeItem("theme");
      } catch {}
      await fetch("/api/auth/signout", { method: "POST" });
    } catch (e) {
      console.error("Logout failed", e);
    } finally {
      setLoggingOut(false);
      // hard redirect so middleware reevaluates and we start clean
      window.location.href = "/login";
    }
  }
  return (
    <>
      <aside
        className={`${
          collapsed ? "w-16" : "w-64"
        } hidden sm:flex h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-col ${
          hydrated ? "transition-all" : ""
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <span
            className={`font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap overflow-hidden transition-opacity duration-200 ${
              collapsed ? "opacity-0 delay-0" : "opacity-100 delay-150"
            }`}
          >
            EF Interviews
          </span>
          {collapsed && (
            <span className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
              EF
            </span>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Toggle sidebar"
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {nav.map((item) => {
              const isActive = pathname === item.href;
              const base =
                "block rounded-md text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500";

              if (collapsed) {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className={`${base} ${
                        isActive
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      } w-12 h-10 mx-auto flex items-center justify-center`}
                      aria-label={item.label}
                      title={item.label}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </li>
                );
              }

              // expanded
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`${base} ${
                      isActive
                        ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    } px-3 h-10 flex items-center text-base`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="py-3 px-2 border-t border-gray-200 dark:border-gray-800">
          {!collapsed && userEmail && (
            <div
              className="mb-2 text-[11px] text-gray-600 dark:text-gray-300 truncate"
              title={userEmail}
            >
              {userEmail}
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Logout"
            className={`${
              collapsed ? "w-12 h-10" : "w-full px-2.5 py-1.5"
            } inline-flex items-center justify-center rounded-md text-xs font-medium ${
              loggingOut
                ? "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-300"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {collapsed ? (
              loggingOut ? (
                // simple spinner for collapsed state
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                <ArrowLeftOnRectangleIcon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              )
            ) : loggingOut ? (
              "Logging out…"
            ) : (
              "Logout"
            )}
          </button>
          <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 text-center">
            v1.1
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`sm:hidden fixed inset-0 z-40 ${
          mobileOpen ? "block" : "hidden"
        }`}
      >
        {/* overlay */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
        {/* panel */}
        <div
          className={`absolute inset-y-0 left-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl transform transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              EF Interviews
            </span>
            <button
              onClick={() => setMobileOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {nav.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                const base =
                  "block rounded-md text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500";
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`${base} ${
                        isActive
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      } px-3 h-10 flex items-center text-base gap-2`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="p-3 border-t border-gray-200 dark:border-gray-800">
            {userEmail && (
              <div
                className="mb-2 text-[11px] text-gray-600 dark:text-gray-300 truncate"
                title={userEmail}
              >
                {userEmail}
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className={`w-full inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium ${
                loggingOut
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed  dark:bg-gray-800 dark:text-gray-300"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {loggingOut ? "Logging out…" : "Logout"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
