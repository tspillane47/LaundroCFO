import Link from "next/link";
import type { ReactNode } from "react";
import HeroDashboard from "./components/HeroDashboard";

function TrustIcon({ variant }: { variant: "shield" | "chart" | "doc" }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    className: "text-blue-400 shrink-0",
  };

  switch (variant) {
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="m7 16 4-4 4 4 4-4" />
        </svg>
      );
    case "doc":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

const heroTrustBadges: { label: string; icon: "shield" | "chart" | "doc" }[] = [
  { label: "Bank-grade security", icon: "shield" },
  { label: "Live valuations", icon: "chart" },
  { label: "Lender-ready reports", icon: "doc" },
];

function GeoIcon({ variant }: { variant: "chart" | "doc" | "grid" | "shield" | "building" | "users" }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    className: "text-gray-700 dark:text-slate-400",
  };

  switch (variant) {
    case "chart":
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="m7 16 4-4 4 4 4-4" />
        </svg>
      );
    case "doc":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "building":
      return (
        <svg {...props}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return null;
  }
}

const problems = [
  {
    icon: "chart" as const,
    title: "No idea what your store is worth",
    description:
      "Most owners have no real-time valuation. They find out at closing — often leaving money on the table.",
  },
  {
    icon: "doc" as const,
    title: "Lease risk nobody talks about",
    description:
      "A short lease can kill a sale or a refinance. Most owners don't realize it until it's too late.",
  },
  {
    icon: "grid" as const,
    title: "Equipment is your biggest asset",
    description:
      "Old machines hurt your valuation multiple. Knowing when to retool is the difference between a 3x and a 5x multiple.",
  },
];

const features = [
  {
    icon: "chart" as const,
    title: "Live Valuation Engine",
    description:
      "Know what your store is worth today. See exactly which factors are driving — or hurting — your valuation.",
  },
  {
    icon: "doc" as const,
    title: "Lease Risk Management",
    description:
      "Track lease expiration, renewal options, and site control. Never get caught with a short lease at closing.",
  },
  {
    icon: "grid" as const,
    title: "Equipment Scoring",
    description:
      "Grade your equipment fleet A through D. See the direct impact on your valuation multiple.",
  },
  {
    icon: "shield" as const,
    title: "Insurance Management",
    description:
      "Track all policies, renewals, and coverage gaps in one place. Get alerts before anything expires.",
  },
  {
    icon: "building" as const,
    title: "Lender-Ready Reports",
    description:
      "Generate professional underwriting reports in seconds. Built for SBA lenders, brokers, and buyers.",
  },
  {
    icon: "users" as const,
    title: "Portfolio Dashboard",
    description:
      "Own multiple stores? Track your entire portfolio value, DSCR, and net worth in one view.",
  },
];

const audiences = [
  {
    title: "Store Owners",
    description:
      "Know your store's value. Maximize it before you sell or refinance. Track every metric that matters to lenders.",
  },
  {
    title: "Brokers & Advisors",
    description:
      "Run valuations in minutes. Generate lender-ready reports. Win more listings with professional analysis.",
  },
  {
    title: "Lenders & Underwriters",
    description:
      "Underwrite laundromat loans with confidence. See DSCR, lease risk, equipment scores, and valuations in one package.",
  },
  {
    title: "Buyers & Investors",
    description:
      "Analyze acquisitions before you buy. Model scenarios. Understand what drives value before you make an offer.",
  },
];

const trustBadges = ["Multi-Store Owner", "Business Broker", "SBA Lender", "CPA / Accountant", "Buyer / Investor"];

const valuationLines = [
  { label: "Base Multiple", value: "4.00x", type: "base" as const },
  { label: "+ Equipment (Grade A, 5.2yr avg)", value: "+0.50x", type: "positive" as const },
  { label: "+ Lease (14 years control)", value: "+0.25x", type: "positive" as const },
  { label: "+ Market (Dense Suburban)", value: "+0.10x", type: "positive" as const },
  { label: "+ Commercial Revenue (18%)", value: "+0.10x", type: "positive" as const },
  { label: "− Competition (Heavy)", value: "−0.25x", type: "negative" as const },
];

export default function MarketingHomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-x-hidden pt-16 bg-[#020B1F]">
        <div
          className="pointer-events-none absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(37,99,235,0.35) 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-20 w-full">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-12 hero-banner">
            <div className="w-full lg:w-[45%]">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium mb-8"
                style={{
                  background: "rgba(37,99,235,0.1)",
                  border: "1px solid rgba(37,99,235,0.3)",
                  color: "#93c5fd",
                }}
              >
                Now in Beta — Free Access
              </div>

              <h1 className="text-[36px] lg:text-[56px] font-bold text-white tracking-tight leading-[1.08] mb-6">
                The Financial Operating System{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(to right, #3b82f6, #60a5fa)" }}
                >
                  for Laundromats
                </span>
              </h1>

              <p className="text-[18px] text-gray-700 dark:text-slate-400 leading-relaxed mb-10 max-w-xl">
                Track store value, underwrite acquisitions, manage leases, and grow your portfolio — all in one
                platform built specifically for laundromat owners, buyers, brokers, and lenders.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-[14px] font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  style={{ boxShadow: "0 0 24px rgba(37,99,235,0.4)" }}
                >
                  Start Free Trial →
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-[14px] font-semibold border border-white/30 text-white hover:border-white/50 hover:bg-white/5 transition-colors"
                >
                  See How It Works
                </a>
              </div>

              <p className="text-[13px] text-slate-500 mb-8">
                No credit card required · Free during beta · Cancel anytime
              </p>

              <div className="flex flex-wrap gap-2">
                {heroTrustBadges.map((badge) => (
                  <span
                    key={badge.label}
                    className="inline-flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-slate-400 px-3 py-1.5 rounded-full"
                    style={{
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(59,130,246,0.15)",
                    }}
                  >
                    <TrustIcon variant={badge.icon} />
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-[55%] overflow-visible">
              <HeroDashboard />
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-10 bg-[#0f1e3d] border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[13px] text-slate-500 mb-6 uppercase tracking-wider">
            Trusted by laundromat owners, brokers, and lenders
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {trustBadges.map((badge) => (
              <span
                key={badge}
                className="px-3 py-1.5 rounded text-[12px] font-medium text-gray-700 dark:text-slate-400 border border-slate-700"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem/Solution */}
      <section className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[28px] lg:text-[36px] font-bold text-slate-900 text-center max-w-4xl mx-auto leading-tight mb-12">
            Laundromats are one of America&apos;s best small businesses. Managing them shouldn&apos;t feel like
            guesswork.
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {problems.map((item) => (
              <div key={item.title} className="p-6 rounded-lg bg-white border border-slate-200">
                <div className="mb-4">
                  <GeoIcon variant={item.icon} />
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[14px] text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-[28px] lg:text-[36px] font-bold text-slate-900 mb-3">
              Everything you need to run your laundromat like a CFO
            </h2>
            <p className="text-[16px] text-gray-700">
              Built specifically for laundromats. Not generic accounting software.
            </p>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}
          >
            {features.map((item) => (
              <div key={item.title} className="p-6 rounded-lg bg-white border border-slate-200">
                <div className="mb-3">
                  <GeoIcon variant={item.icon} />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[28px] lg:text-[36px] font-bold text-slate-900 text-center mb-12">
            Built for everyone in the laundromat industry
          </h2>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}
          >
            {audiences.map((item) => (
              <div key={item.title} className="p-5 rounded-lg bg-white border border-slate-200">
                <h3 className="text-[14px] font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Valuation preview */}
      <section className="py-20 bg-[#0a1628]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-[28px] lg:text-[32px] font-bold text-white text-center mb-10">
            See exactly why your store is worth what it&apos;s worth
          </h2>
          <div className="rounded-lg p-6 border border-slate-700 bg-[#0f1e3d]">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-5">
              Valuation Breakdown
            </div>
            <div className="space-y-2">
              {valuationLines.map((line) => (
                <div key={line.label} className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-700 dark:text-slate-400">{line.label}</span>
                  <span
                    className={
                      line.type === "positive"
                        ? "font-semibold text-green-400 tabular-nums"
                        : line.type === "negative"
                          ? "font-semibold text-red-400 tabular-nums"
                          : "font-semibold text-slate-200 tabular-nums"
                    }
                  >
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-700 mt-5 pt-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Final Multiple</span>
                <span className="text-[20px] font-bold text-blue-400 tabular-nums">4.70x</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500">× EBITDA</span>
                <span className="font-semibold text-slate-200 tabular-nums">$237,843</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Store Value</span>
                <span className="text-[24px] font-bold text-green-400 tabular-nums">$1,098,472</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0f1e3d] border-t border-slate-800">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[28px] lg:text-[36px] font-bold text-white mb-3">
            Start tracking your laundromat&apos;s value today.
          </h2>
          <p className="text-[16px] text-gray-700 dark:text-slate-400 mb-8">Free during beta. No credit card required.</p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-8 py-3 rounded-md text-[15px] font-semibold bg-[#1D4ED8] text-white hover:opacity-90 transition-opacity"
          >
            Create Free Account
          </Link>
          <p className="text-[13px] text-slate-500 mt-6">
            Join laundromat owners, brokers, and lenders already using LaundroCFO
          </p>
        </div>
      </section>
    </>
  );
}
