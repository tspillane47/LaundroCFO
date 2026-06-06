"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const pageTitle: Record<string, string> = {
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

            {/* Store pill */}
            <div className="p-4 border-t border-white/[0.07]">
              <div className="bg-[#1e2a3a] border border-white/[0.08] rounded-lg p-3 flex items-center gap-2.5 cursor-pointer">
                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold text-slate-200 leading-tight">Sunnyvale Super Wash</div>
                  <div className="text-[10px] text-slate-500 leading-tight">Sunnyvale, CA</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Topbar */}
            <header className="bg-[#161f30] border-b border-white/[0.07] px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-semibold text-slate-100">
                  {pageTitle[pathname] ?? "LaundroCFO"}
                </span>
                <span className="bg-[#1e2a3a] border border-white/[0.08] rounded-md px-2.5 py-1 text-[11px] text-slate-400">
                  Sunnyvale Super Wash
                </span>
                <span className="text-[11px] text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Synced 2m ago
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button className="btn-outline">Export Report</button>
                <button className="btn-primary">+ Add Store</button>
                <div className="w-[30px] h-[30px] rounded-full bg-blue-700 flex items-center justify-center text-[11px] font-bold text-white">
                  JD
                </div>
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
