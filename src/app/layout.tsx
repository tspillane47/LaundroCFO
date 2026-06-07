"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import clsx from "clsx";

const navItems = [
  { href: "/dashboard", label: "Dashboard", emoji: "⬛" },
  { href: "/financials", label: "Financials", emoji: "📊" },
  { href: "/lease", label: "Lease", emoji: "📋" },
  { href: "/equipment", label: "Equipment", emoji: "⚙️" },
  { href: "/scenarios", label: "Scenarios", emoji: "🔀" },
  { href: "/benchmarking", label: "Benchmarking", emoji: "📈" },
  { href: "/reports", label: "Reports", emoji: "📄" },
  { href: "/alerts", label: "Alerts", emoji: "🔔", badge: 3 },
  { href: "/integrations", label: "Integrations", emoji: "🔌" },
  { href: "/settings", label: "Settings", emoji: "⚙️" },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Store Dashboard",
  "/financials": "Financials",
  "/lease": "Lease Analysis",
  "/equipment": "Equipment",
  "/scenarios": "Scenario Planner",
  "/benchmarking": "Benchmarking",
  "/reports": "Reports",
  "/alerts": "Alerts",
  "/integrations": "Integrations",
  "/settings": "Settings",
};

const authPages = ["/login", "/signup", "/forgot-password", "/onboarding", "/reset-password"];

type Store = {
  id: string;
  name: string;
  address: string;
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const storePickerRef = useRef<HTMLDivElement>(null);

  const isAuthPage = authPages.includes(pathname);

  useEffect(() => {
    if (isAuthPage) return;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from("stores").select("id, name, address").eq("user_id", user.id);
      if (data && data.length > 0) {
        setStores(data);
        const savedId = localStorage.getItem("selectedStoreId");
        const saved = data.find((s) => s.id === savedId);
        setSelectedStore(saved ?? data[0]);
      }
    }

    load();
  }, [isAuthPage, pathname]);

  useEffect(() => {
    if (!showStorePicker) return;

    function handleClickOutside(e: MouseEvent) {
      if (storePickerRef.current && !storePickerRef.current.contains(e.target as Node)) {
        setShowStorePicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStorePicker]);

  function selectStore(store: Store) {
    setSelectedStore(store);
    localStorage.setItem("selectedStoreId", store.id);
    setShowStorePicker(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (isAuthPage) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-[220px] bg-[#161f30] border-r border-white/[0.07] flex flex-col flex-shrink-0">
            <div className="px-5 py-[18px] border-b border-white/[0.07]">
              <div className="text-[15px] font-bold text-blue-300 tracking-tight">LaundroCFO</div>
              <div className="text-[10px] text-slate-500 mt-0.5 tracking-widest uppercase">Valuation & Underwriting</div>
            </div>

            <nav className="flex-1 py-3 overflow-y-auto">
              <div className="text-[10px] text-slate-600 px-5 pt-2 pb-1 uppercase tracking-widest">Analytics</div>
              {navItems.slice(0, 4).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx("nav-item", pathname === item.href && "nav-item-active")}
                >
                  <span className="text-[13px] w-4 text-center">{item.emoji}</span>
                  {item.label}
                </Link>
              ))}

              <div className="text-[10px] text-slate-600 px-5 pt-4 pb-1 uppercase tracking-widest">Tools</div>
              {navItems.slice(4, 7).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx("nav-item", pathname === item.href && "nav-item-active")}
                >
                  <span className="text-[13px] w-4 text-center">{item.emoji}</span>
                  {item.label}
                </Link>
              ))}

              <div className="text-[10px] text-slate-600 px-5 pt-4 pb-1 uppercase tracking-widest">Settings</div>
              {navItems.slice(7).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx("nav-item", pathname === item.href && "nav-item-active")}
                >
                  <span className="text-[13px] w-4 text-center">{item.emoji}</span>
                  {item.label}
                  {item.badge && (
                    <span className="ml-auto badge badge-red text-[10px] px-1.5 py-0">{item.badge}</span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Store switcher */}
            <div className="p-4 border-t border-white/[0.07] relative" ref={storePickerRef}>
              <button
                type="button"
                onClick={() => setShowStorePicker((v) => !v)}
                className="w-full bg-[#1e2a3a] border border-white/[0.08] rounded-lg p-3 flex items-center gap-2.5 cursor-pointer text-left hover:border-white/[0.15] transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-slate-200 leading-tight truncate">
                    {selectedStore?.name ?? "No store selected"}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight truncate">
                    {selectedStore?.address ?? "Add a store to get started"}
                  </div>
                </div>
                {stores.length > 1 && (
                  <span className="text-[10px] text-slate-500 flex-shrink-0">{showStorePicker ? "▲" : "▼"}</span>
                )}
              </button>

              {showStorePicker && stores.length > 1 && (
                <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#1e2a3a] border border-white/[0.08] rounded-lg overflow-hidden shadow-lg z-50">
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => selectStore(store)}
                      className={clsx(
                        "w-full px-3 py-2.5 text-left hover:bg-white/5 transition-colors",
                        selectedStore?.id === store.id && "bg-blue-500/10"
                      )}
                    >
                      <div className="text-[11px] font-semibold text-slate-200 leading-tight">{store.name}</div>
                      <div className="text-[10px] text-slate-500 leading-tight truncate">{store.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Topbar */}
            <header className="bg-[#161f30] border-b border-white/[0.07] px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-semibold text-slate-100">
                  {pageTitles[pathname] ?? "LaundroCFO"}
                </span>
                {selectedStore && (
                  <span className="bg-[#1e2a3a] border border-white/[0.08] rounded-md px-2.5 py-1 text-[11px] text-slate-400">
                    {selectedStore.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button type="button" className="btn-outline" onClick={handleSignOut}>
                  Sign Out
                </button>
                <button type="button" className="btn-primary" onClick={() => router.push("/onboarding")}>
                  + Add Store
                </button>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto bg-[#0d1520] p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
