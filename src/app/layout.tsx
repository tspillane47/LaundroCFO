"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import { StoreProvider, useStores } from "@/lib/store-context";
import clsx from "clsx";
import {
  NavIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  StoreIcon,
  MenuIcon,
  CloseIcon,
} from "@/components/ui/NavIcons";
import { Logo } from "@/components/ui/Logo";
import { FeedbackModal } from "@/components/ui/FeedbackModal";
import { BetaBanner } from "@/components/ui/BetaBanner";
import { setTermsReturnPath } from "@/components/ui/TermsBackLink";
import { BETA_MODE } from "@/lib/config";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AlertNotificationProvider } from "@/components/alerts/AlertNotificationProvider";
import { isOnboardingComplete } from "@/lib/onboarding";

const ADMIN_EMAIL = "tuckerspillane7@gmail.com";

function getUserInitials(fullName: string | null, email: string | null): string {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0]?.toUpperCase() ?? "?";
  }
  if (email) {
    return email[0]?.toUpperCase() ?? "?";
  }
  return "?";
}

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
      { href: "/account", label: "Account", icon: "account" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

const pageTitles: Record<string, string> = {
  "/portfolio": "Portfolio",
  "/dashboard": "Store Dashboard",
  "/financials": "Financials",
  "/transactions": "Transactions",
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
  "/account": "Account",
  "/settings": "Settings",
  "/settings/manage-stores": "Manage Stores",
  "/settings/edit-store": "Edit Store",
  "/admin/feedback": "Feedback Admin",
};

const authPages = ["/login", "/signup", "/forgot-password", "/onboarding", "/reset-password", "/auth/callback"];
const publicPages = ["/terms"];
const marketingPages = ["/", "/about", "/pricing"];
const onboardingExemptPaths = [
  ...publicPages,
  ...marketingPages,
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/onboarding",
];

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const isExempt = onboardingExemptPaths.includes(pathname) || pathname.startsWith("/auth/callback");
  const isAddingStore = pathname === "/onboarding" && searchParams.get("add") === "true";

  useEffect(() => {
    let cancelled = false;

    async function checkOnboarding() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setChecked(true);
        return;
      }

      const completed = await isOnboardingComplete(supabase, user.id);

      if (cancelled) return;

      if (completed) {
        if (pathname === "/onboarding" && !isAddingStore) {
          router.replace("/portfolio");
          return;
        }
        setChecked(true);
        return;
      }

      if (!isExempt) {
        router.replace("/onboarding");
        return;
      }

      setChecked(true);
    }

    setChecked(false);
    void checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [pathname, isExempt, isAddingStore, router, supabase]);

  if (!checked && !isExempt) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <div className="text-[13px] text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

function OnboardingGuardFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <div className="text-[13px] text-[var(--text-muted)]">Loading...</div>
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { stores, selectedStore, setSelectedStore, isAllStores, setIsAllStores, loading: storesLoading } = useStores();
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navTooltip, setNavTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const sidebarStoreRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      setIsAdminUser(user.email === ADMIN_EMAIL);
      setUserEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setUserFullName(
        (profile?.full_name as string | null) ?? (user.user_metadata?.full_name as string | undefined) ?? null
      );
      setUserAvatarUrl((profile?.avatar_url as string | null) ?? null);
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
    setNavTooltip(null);
  }

  function showSidebarTooltip(e: React.MouseEvent<HTMLElement>, label: string) {
    if (!sidebarCollapsed || window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setNavTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  }

  function hideSidebarTooltip() {
    setNavTooltip(null);
  }

  useEffect(() => {
    if (!showStoreDropdown && !mobileMenuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        storeDropdownRef.current?.contains(target) ||
        sidebarStoreRef.current?.contains(target) ||
        mobileMenuRef.current?.contains(target)
      ) {
        return;
      }
      setShowStoreDropdown(false);
      setMobileMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStoreDropdown, mobileMenuOpen]);

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

  const visibleNavSections = useMemo(() => {
    if (!isAdminUser) return navSections;

    return navSections.map((section) => {
      if (section.label !== "ACCOUNT") return section;
      return {
        ...section,
        items: [
          ...section.items,
          { href: "/admin/feedback", label: "Admin", icon: "admin" },
        ],
      };
    });
  }, [isAdminUser]);

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
          "app-sidebar flex flex-col flex-shrink-0 transition-colors duration-300",
          sidebarOpen && "open",
          sidebarCollapsed && "sidebar-collapsed"
        )}
        style={{ background: "var(--bg-sidebar)" }}
      >
        <div
          className="sidebar-brand flex items-center gap-2 px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <Logo variant="sidebar" />
          {BETA_MODE && (
            <span className="sidebar-brand-badge badge badge-blue text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide">
              Beta
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden">
          {visibleNavSections.map((section, sectionIndex) => (
            <div key={section.label}>
              {sectionIndex > 0 && <div className="sidebar-section-divider" aria-hidden="true" />}
              <div
                className="sidebar-section-label"
                style={{
                  fontSize: "10px",
                  color: "var(--sidebar-section)",
                  padding: "16px 20px 4px",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  textTransform: "uppercase",
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
                    className={clsx("nav-item group relative", active && "nav-item-active")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "7px 20px",
                      fontSize: "13px",
                      textDecoration: "none",
                      fontWeight: active ? 500 : 400,
                      color: active ? "var(--nav-active-text)" : "var(--sidebar-text-muted)",
                      background: active ? "var(--bg-nav-active)" : "transparent",
                      borderLeft: active ? "3px solid var(--nav-active-border)" : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      showSidebarTooltip(e, item.label);
                      if (!active) e.currentTarget.style.background = "color-mix(in srgb, var(--bg-sidebar-hover) 50%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      hideSidebarTooltip();
                      e.currentTarget.style.background = active ? "var(--bg-nav-active)" : "transparent";
                    }}
                  >
                    <NavIcon name={item.icon} />
                    <span className="nav-item-label">{item.label}</span>
                  </Link>
                );
              })}
              {section.label === "ACCOUNT" && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackOpen(true);
                    setSidebarOpen(false);
                  }}
                  className="sidebar-nav-button nav-item group relative"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "7px 20px",
                    fontSize: "13px",
                    fontWeight: 400,
                    color: "var(--sidebar-text-muted)",
                    background: "transparent",
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    showSidebarTooltip(e, "Feedback");
                    e.currentTarget.style.background = "color-mix(in srgb, var(--bg-card2) 50%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    hideSidebarTooltip();
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <NavIcon name="feedback" />
                  <span className="nav-item-label">Feedback</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleSidebarCollapsed}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>

        {/* Store switcher */}
        <div
          className="sidebar-store-switcher p-4 border-t relative"
          style={{ borderColor: "var(--border)" }}
          ref={sidebarStoreRef}
        >
          <button
            type="button"
            onClick={() => setShowStoreDropdown((v) => !v)}
            className="sidebar-store-button group relative w-full rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 transition-colors hover:opacity-90"
            style={{
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
            }}
            onMouseEnter={(e) => {
              showSidebarTooltip(
                e,
                isAllStores ? "All Stores" : (selectedStore?.name ?? "Select store")
              );
            }}
            onMouseLeave={hideSidebarTooltip}
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <span className="sidebar-store-icon">
                <StoreIcon />
              </span>
              <span
                className="sidebar-store-label text-[12px] font-medium truncate text-left"
                style={{ color: "var(--text-primary)" }}
              >
                {isAllStores ? "All Stores" : (selectedStore?.name ?? "Select store")}
              </span>
            </span>
            <span className="sidebar-store-chevron">
              <ChevronDownIcon />
            </span>
          </button>

          {showStoreDropdown && (
            <div
              className={clsx(
                "absolute rounded-lg overflow-hidden z-50 surface-panel",
                sidebarCollapsed
                  ? "left-full bottom-0 ml-2 min-w-[200px]"
                  : "bottom-full left-4 right-4 mb-1"
              )}
              style={{ border: "1px solid var(--border)" }}
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
          className="relative px-4 md:px-6 flex items-center justify-between flex-shrink-0 transition-colors duration-300 min-h-[56px] md:min-h-0 md:h-12 py-2 md:py-0"
          style={{ background: "var(--bg-page)" }}
        >
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
            <span
              className="topbar-page-title text-[14px] font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {pageTitles[pathname] ?? "LaundroCFO"}
            </span>

            {!storesLoading && stores.length > 0 && (
              <>
                <span className="hidden md:inline" style={{ color: "var(--border2)" }}>|</span>
                <div className="relative min-w-0" ref={storeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowStoreDropdown((v) => !v)}
                    className="topbar-store-badge flex items-center gap-1.5 text-[14px] md:text-[12px] transition-colors hover:opacity-80 min-h-[44px] md:min-h-0 truncate max-w-[140px] sm:max-w-[200px] md:max-w-none"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="truncate">{dropdownLabel}</span>
                    <ChevronDownIcon />
                  </button>

                  {showStoreDropdown && (
                    <div
                      className="absolute top-full left-0 mt-1 min-w-[200px] rounded-lg overflow-hidden z-50 surface-panel"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <button
                        type="button"
                        onClick={selectAllStores}
                        className={clsx(
                          "w-full px-3 py-2.5 text-left text-[14px] md:text-[12px] font-medium hover:bg-[var(--bg-card2)] transition-colors min-h-[44px]",
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
              className="topbar-synced text-[14px] md:text-[11px] truncate flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              Last synced 2m ago
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/account"
              className="flex items-center justify-center w-11 h-11 md:w-8 md:h-8 rounded-full overflow-hidden flex-shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 transition-opacity hover:opacity-80"
              style={{
                background: "var(--bg-card2)",
                border: "1px solid var(--border)",
              }}
              aria-label="Account"
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {getUserInitials(userFullName, userEmail)}
                </span>
              )}
            </Link>

            <div className="desktop-header-actions">
              <button type="button" className="btn-outline" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>

            <div className="mobile-header-menu" ref={mobileMenuRef}>
              <button
                type="button"
                className="btn-outline w-11 h-11 flex items-center justify-center p-0 min-h-[44px] min-w-[44px]"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={mobileMenuOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {mobileMenuOpen && (
                <div
                  className="absolute right-4 top-full mt-1 min-w-[180px] rounded-lg overflow-hidden z-50 surface-panel"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-[14px] font-medium hover:opacity-90 transition-colors min-h-[44px]"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void handleSignOut();
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <BetaBanner onFeedbackClick={() => setFeedbackOpen(true)} />

        {/* Page content */}
        <main className="app-page-content flex-1 overflow-y-auto p-4 md:p-6 transition-colors duration-300">
          {children}
        </main>

        <footer
          className="flex-shrink-0 px-6 py-2 border-t text-center"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <Link
            href="/terms"
            onClick={() => setTermsReturnPath(pathname)}
            className="text-[11px] hover:underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            Disclaimer
          </Link>
        </footer>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {navTooltip && (
        <div
          className="sidebar-floating-tooltip"
          role="tooltip"
          style={{
            top: navTooltip.top,
            left: navTooltip.left,
          }}
        >
          {navTooltip.label}
        </div>
      )}
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = authPages.includes(pathname);
  const isPublicPage = publicPages.includes(pathname);
  const isMarketingPage = marketingPages.includes(pathname);

  if (isAuthPage || isMarketingPage) {
    return (
      <html lang="en">
        <body>
          <ToastProvider>
            <Suspense fallback={<OnboardingGuardFallback />}>
              <OnboardingGuard>{children}</OnboardingGuard>
            </Suspense>
          </ToastProvider>
        </body>
      </html>
    );
  }

  if (isPublicPage) {
    return (
      <html lang="en">
        <body>
          <ToastProvider>
            <Suspense fallback={<OnboardingGuardFallback />}>
              <OnboardingGuard>
                <StoreProvider>{children}</StoreProvider>
              </OnboardingGuard>
            </Suspense>
          </ToastProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <Suspense fallback={<OnboardingGuardFallback />}>
            <OnboardingGuard>
              <StoreProvider>
                <AlertNotificationProvider>
                  <AppShell>{children}</AppShell>
                </AlertNotificationProvider>
              </StoreProvider>
            </OnboardingGuard>
          </Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}
