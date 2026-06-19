import Link from "next/link";
import HeroDashboard from "./components/HeroDashboard";
import MarketingSections from "./components/MarketingSections";

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
                🚀 Now in Beta — Free Access
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

              <p className="text-[18px] text-slate-400 leading-relaxed mb-3 max-w-xl">
                LaundroCFO helps laundromat owners and operators track store value, portfolio value, debt,
                equity, leases, equipment, cash flow, and generate lender-ready reports — all in one platform.
              </p>

              <p className="text-[14px] text-slate-500 mb-10 max-w-xl">
                Know your value. Manage your debt. Grow your portfolio.
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
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 px-3 py-1.5 rounded-full"
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

      <MarketingSections />
    </>
  );
}
