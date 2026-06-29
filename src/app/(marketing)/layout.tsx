"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

const footerLinks = [
  { href: "/#features", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Sign Up" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navSolid = scrolled || !isHome;

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header
        className={clsx(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          navSolid
            ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-200/80"
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-[18px] font-bold text-[#2563eb] tracking-tight flex-shrink-0">
            LaundroCFO
          </Link>

          <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "text-[14px] font-medium transition-colors",
                  navSolid ? "text-slate-600 hover:text-slate-900" : "text-gray-700 dark:text-gray-800 dark:text-slate-300 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            <Link
              href="/login"
              className={clsx(
                "px-4 py-2 rounded-lg text-[13px] font-semibold border transition-colors",
                navSolid
                  ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                  : "border-white/30 text-white hover:bg-white/10"
              )}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
            >
              Start Free Trial
            </Link>
          </div>

          <button
            type="button"
            className={clsx(
              "md:hidden p-2 rounded-lg transition-colors",
              navSolid ? "text-slate-700 hover:bg-slate-100" : "text-white hover:bg-white/10"
            )}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 shadow-lg px-6 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block py-3 text-[15px] font-medium text-slate-700 hover:text-[#2563eb]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 flex flex-col gap-2 border-t border-slate-100 mt-2">
              <Link
                href="/login"
                className="w-full text-center py-2.5 rounded-lg text-[13px] font-semibold border border-slate-300 text-slate-700"
                onClick={() => setMobileOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="w-full text-center py-2.5 rounded-lg text-[13px] font-semibold bg-[#2563eb] text-white"
                onClick={() => setMobileOpen(false)}
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer style={{ background: "#0f1e3d" }} className="text-white">
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
            <div>
              <div className="text-[20px] font-bold text-[#60a5fa] tracking-tight">LaundroCFO</div>
              <p className="text-[14px] text-gray-700 dark:text-gray-800 dark:text-slate-400 mt-2 max-w-xs leading-relaxed">
                The financial operating system for laundromat owners, buyers, brokers, and lenders.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[14px] text-gray-700 dark:text-gray-800 dark:text-slate-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 text-[13px] text-slate-500">
            © 2025 LaundroCFO. Built for laundromat owners, buyers, and lenders.
          </div>
        </div>
      </footer>
    </div>
  );
}
