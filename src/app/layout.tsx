"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { StoreProvider, useStores } from "@/lib/store-context";
import clsx from "clsx";
import { NavIcon, SunIcon, MoonIcon, ChevronDownIcon, MenuIcon, CloseIcon } from "@/components/ui/NavIcons";
import Logo from '@/components/Logo'

const navSections = [
  {
    label: "PORTFOLIO",
    items: [{ href: "/portfolio", label: "Portfolio", icon: "portfolio" }],
  },
  {
    label: "STORE",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/valuation", label: "Valuation", icon: "valuation" },
      { href: "/financials", label: "Financials", icon: "financials" },
      { href: "/transactions", label: "Transactions", icon: "transactions" },
      { href: "/utilities", label: "Utilities", icon: "utilities" },
      { href: "/lease", label: "Occupancy", icon: "occupancy" },
      { href: "/equipment", label: "Equipment", icon: "equipment" },
      { href: "/insurance", label: "Insurance", icon: "insurance" },
      { href: "/debt", label: "Debt", icon: "debt" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { href: "/scenarios", label: "Scenarios", icon: "scenarios" },
      { href: "/benchmarking", label: "Benchmarking", icon: "benchmarking" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/integrations", label: "Integrations", icon: "integrations" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { href: "/alerts", label: "Alerts", icon: "alerts" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  "/portfolio": "Portfolio",
  "/dashboard": "Store Dashboard",
  "/financials": "Financials",
  "/transactions": "Transaction Review",
  "/utilities": "Utilities",
  "/lease": "Occupancy & Real Estate",
  "/equipment": "Equipment",
  "/valuation": "Valuation Engine",
  "/scenarios": "Scenario Planner",
  "/benchmarking": "Benchmarking",
  "/reports": "Reports",
  "/insurance": "Insurance",
  "/debt": "Debt Management",
  "/alerts": "Alerts",
  "/integrations": "Integrations",
  "/settings": "Settings",
  "/settings/manage-stores": "Manage Stores",
  "/settings/edit-store": "Edit Store",
};

const authPages = ["/login", "/signup", "/forgot-password", "/onboarding", "/reset-password", "/auth/callback"];
const marketingPages = ["/", "/pricing", "/about"];

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { stores, selectedStore, setSelectedStore, isAllStores, setIsAllStores, loading: storesLoading } = useStores();
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const sidebarStoreRef = useRef<HTMLDivElement>(null);

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
      const target = e.target as Node;
      if (
        storeDropdownRef.current?.contains(target) ||
        sidebarStoreRef.current?.contains(target)
      ) {
        return;
      }
      setShowStoreDropdown(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStoreDropdown]);

  function selectAllStores() {
    setSelectedStore(null);
    setIsAllStores(true);
    setShowStoreDropdown(false);
    setStoreSearch("");
  }

  function selectStore(store: (typeof stores)[0]) {
    setSelectedStore(store);
    setIsAllStores(false);
    setShowStoreDropdown(false);
    setStoreSearch("");
  }

  const activeStores = useMemo(() => {
    const seen = new Set<string>();
    return stores
      .filter((s) => !s.archived)
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
  }, [stores]);

  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return activeStores;
    const q = storeSearch.toLowerCase();
    return activeStores.filter((s) => (s.name ?? "").toLowerCase().includes(q));
  }, [activeStores, storeSearch]);

  function renderStoreOption(store: (typeof stores)[0]) {
    const isSelected = !isAllStores && selectedStore?.id === store.id;
    return (
      <button
        key={store.id}
        type="button"
        onClick={() => selectStore(store)}
        className="w-full px-3 py-2.5 text-left hover:opacity-90 transition-colors border-t"
        style={{
          borderColor: "var(--border)",
          background: isSelected ? "var(--bg-card2)" : undefined,
        }}
      >
        <div
          className="font-bold leading-tight truncate"
          style={{ fontSize: "13px", color: "var(--text-primary)", maxWidth: "100%" }}
        >
          {store.name}
        </div>
        {store.address && (
          <div
            className="leading-tight truncate mt-0.5"
            style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "100%" }}
          >
            {store.address}
          </div>
        )}
      </button>
    );
  }

  function renderStoreDropdown(showSearch: boolean) {
    return (
      <>
        {showSearch && (
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="Search stores..."
              className="w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div style={{ maxHeight: "280px", overflowY: "auto" }}>
          {filteredStores.map(renderStoreOption)}
        </div>
      </>
    );
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
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--sidebar-border, var(--border))" }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: "var(--sidebar-border, var(--border))" }}
        >
          <Logo color="white" />
        </div>

        <nav className="flex-1 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--sidebar-text-muted, var(--text-muted))",
                  padding: "16px 20px 4px",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx("nav-item", active && "nav-item-active")}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Store switcher */}
        <div className="p-4 border-t relative" style={{ borderColor: "var(--sidebar-border, var(--border))" }} ref={sidebarStoreRef}>
          <button
            type="button"
            onClick={() => setShowStoreDropdown((v) => !v)}
            className="w-full rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 transition-colors hover:opacity-90"
            style={{
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="text-[12px] font-medium truncate text-left"
              style={{ color: "var(--text-primary)" }}
            >
              {isAllStores ? "All Stores" : (selectedStore?.name ?? "Select store")}
            </span>
            <ChevronDownIcon />
          </button>

          {showStoreDropdown && (
            <div
              className="absolute bottom-full left-4 right-4 mb-1 rounded-lg overflow-hidden z-50"
              style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
            >
              <button
                type="button"
                onClick={selectAllStores}
                className="w-full px-3 py-2.5 text-left text-[12px] font-medium hover:opacity-90 transition-colors"
                style={{
                  color: "var(--text-primary)",
                  background: isAllStores ? "var(--bg-card)" : undefined,
                }}
              >
                All Stores
              </button>
              {renderStoreDropdown(activeStores.length > 5)}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="app-main flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="px-6 flex items-center justify-between flex-shrink-0 transition-colors duration-300"
          style={{
            background: "var(--bg-card)",
            borderBottom: "1px solid var(--border)",
            height: "48px",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {pageTitles[pathname] ?? "LaundroCFO"}
            </span>

            {!storesLoading && stores.length > 0 && (
              <>
                <span style={{ color: "var(--border2)" }}>|</span>
                <div className="relative" ref={storeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowStoreDropdown((v) => !v)}
                    className="topbar-store-badge flex items-center gap-1.5 text-[12px] transition-colors hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>{dropdownLabel}</span>
                    <ChevronDownIcon />
                  </button>

                  {showStoreDropdown && (
                    <div
                      className="absolute top-full left-0 mt-1 min-w-[200px] rounded-lg overflow-hidden z-50"
                      style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
                    >
                      <button
                        type="button"
                        onClick={selectAllStores}
                        className={clsx(
                          "w-full px-3 py-2.5 text-left text-[12px] font-medium hover:bg-white/5 transition-colors",
                          isAllStores && "font-semibold"
                        )}
                        style={{
                          color: "var(--text-primary)",
                          background: isAllStores ? "var(--bg-card)" : undefined,
                        }}
                      >
                        All Stores
                      </button>
                      {renderStoreDropdown(activeStores.length > 5)}
                    </div>
                  )}
                </div>
              </>
            )}

            <span
              className="topbar-synced text-[11px] hide-mobile"
              style={{ color: "var(--text-muted)" }}
            >
              Last synced 2m ago
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn-outline w-8 h-8 flex items-center justify-center p-0"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
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
