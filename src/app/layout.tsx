"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { StoreProvider, useStores } from "@/lib/store-context";
import clsx from "clsx";

const navSections = [
  {
    label: "Portfolio",
    items: [
      { href: "/portfolio", label: "Portfolio", emoji: "🏦" },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/dashboard", label: "Dashboard", emoji: "⬛" },
      { href: "/valuation", label: "Valuation", emoji: "💎" },
      { href: "/financials", label: "Financials", emoji: "📊" },
      { href: "/lease", label: "Occupancy", emoji: "📋" },
      { href: "/equipment", label: "Equipment", emoji: "⚙️" },
      { href: "/insurance", label: "Insurance", emoji: "🛡️" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/scenarios", label: "Scenarios", emoji: "🔀" },
      { href: "/benchmarking", label: "Benchmarking", emoji: "📈" },
      { href: "/reports", label: "Reports", emoji: "📄" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/alerts", label: "Alerts", emoji: "🔔" },
      { href: "/settings", label: "Settings", emoji: "⚙️" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  "/portfolio": "Portfolio",
  "/dashboard": "Store Dashboard",
  "/financials": "Financials",
  "/lease": "Occupancy & Real Estate",
  "/equipment": "Equipment",
  "/valuation": "Valuation Engine",
  "/scenarios": "Scenario Planner",
  "/benchmarking": "Benchmarking",
  "/reports": "Reports",
  "/insurance": "Insurance",
  "/alerts": "Alerts",
  "/integrations": "Integrations",
  "/settings": "Settings",
};

const authPages = ["/login", "/signup", "/forgot-password", "/onboarding", "/reset-password"];
const marketingPages = ["/", "/pricing", "/about"];

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { stores, selectedStore, setSelectedStore, isAllStores, setIsAllStores, loading: storesLoading } = useStores();
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const storeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    let dark: boolean;
    if (saved === "dark") dark = true;
    else if (saved === "light") dark = false;
    else dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    setIsDark(dark);
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  function toggleTheme() {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
    if (newDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }

  useEffect(() => {
    if (!showStoreDropdown) return;

    function handleClickOutside(e: MouseEvent) {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
        setShowStoreDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStoreDropdown]);

  function selectAllStores() {
    setSelectedStore(null);
    setIsAllStores(true);
    setShowStoreDropdown(false);
  }

  function selectStore(store: (typeof stores)[0]) {
    setSelectedStore(store);
    setIsAllStores(false);
    setShowStoreDropdown(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const dropdownLabel = isAllStores ? "All Stores" : (selectedStore?.name ?? "All Stores");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-page)" }}>
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={clsx(
          "app-sidebar w-[220px] flex flex-col flex-shrink-0 border-r transition-colors duration-300",
          sidebarOpen && "open"
        )}
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border)" }}
      >
        <div className="px-5 py-[18px] border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-[15px] font-bold text-blue-300 tracking-tight">LaundroCFO</div>
          <div className="text-[10px] text-slate-500 mt-0.5 tracking-widest uppercase">Valuation & Underwriting</div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {navSections.map((section, sectionIndex) => (
            <div key={section.label}>
              <div
                className={clsx(
                  "text-[10px] px-5 pb-1 uppercase tracking-widest",
                  sectionIndex === 0 ? "pt-2" : "pt-4"
                )}
                style={{ color: "var(--text-muted)" }}
              >
                {section.label}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx("nav-item", pathname === item.href && "nav-item-active")}
                >
                  <span className="text-[13px] w-4 text-center">{item.emoji}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Store pill */}
        <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div
            className="w-full rounded-lg p-3 flex items-center gap-2.5"
            style={{ background: "var(--bg-card2)", border: "1px solid var(--border2)" }}
          >
            <div className={clsx("w-2 h-2 rounded-full flex-shrink-0", isAllStores ? "bg-blue-400" : "bg-green-400")} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                {isAllStores ? "All Stores" : (selectedStore?.name ?? "No store selected")}
              </div>
              <div className="text-[10px] leading-tight truncate" style={{ color: "var(--text-muted)" }}>
                {isAllStores
                  ? `${stores.length} store${stores.length !== 1 ? "s" : ""} in portfolio`
                  : (selectedStore?.address ?? "Select a store")}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="app-main flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="px-6 py-3 flex items-center justify-between flex-shrink-0 transition-colors duration-300"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {pageTitles[pathname] ?? "LaundroCFO"}
            </span>

            {/* Store selector dropdown */}
            {!storesLoading && stores.length > 0 && (
              <div className="relative" ref={storeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStoreDropdown((v) => !v)}
                  className="topbar-store-badge flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors hover:opacity-90"
                  style={{
                    background: "var(--bg-card2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span>{dropdownLabel}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {showStoreDropdown ? "▲" : "▼"}
                  </span>
                </button>

                {showStoreDropdown && (
                  <div
                    className="absolute top-full left-0 mt-1 min-w-[200px] rounded-lg overflow-hidden shadow-lg z-50"
                    style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
                  >
                    <button
                      type="button"
                      onClick={selectAllStores}
                      className={clsx(
                        "w-full px-3 py-2.5 text-left text-[12px] font-medium hover:bg-white/5 transition-colors",
                        isAllStores && "bg-blue-500/10 text-blue-300"
                      )}
                      style={{ color: isAllStores ? undefined : "var(--text-primary)" }}
                    >
                      All Stores
                    </button>
                    {stores.map((store) => (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => selectStore(store)}
                        className={clsx(
                          "w-full px-3 py-2.5 text-left hover:bg-white/5 transition-colors border-t",
                          !isAllStores && selectedStore?.id === store.id && "bg-blue-500/10"
                        )}
                        style={{ borderColor: "var(--border)" }}
                      >
                        <div className="text-[12px] font-medium text-slate-200 leading-tight">{store.name}</div>
                        {store.address && (
                          <div className="text-[10px] text-slate-500 leading-tight truncate mt-0.5">{store.address}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <span
              className="topbar-synced flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
              style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Synced
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn-outline w-9 h-9 flex items-center justify-center p-0 text-base"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? "☀️" : "🌙"}
            </button>
            <button type="button" className="btn-outline" onClick={handleSignOut}>
              Sign Out
            </button>
            <button type="button" className="topbar-add-store btn-primary" onClick={() => router.push("/onboarding")}>
              + Add Store
            </button>
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto p-6 transition-colors duration-300"
          style={{ background: "var(--bg-page)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);
  const isAuthPage = authPages.includes(pathname);
  const isMarketingPage = marketingPages.includes(pathname);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    let dark: boolean;
    if (saved === "dark") dark = true;
    else if (saved === "light") dark = false;
    else dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    setIsDark(dark);
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  if (isAuthPage || isMarketingPage) {
    return (
      <html lang="en" className={isDark ? "dark" : ""}>
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" className={isDark ? "dark" : ""}>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
