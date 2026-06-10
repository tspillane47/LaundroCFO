import Link from "next/link";
import HeroIllustration from "./components/HeroIllustration";

const problems = [
  {
    icon: "🤷",
    title: "No idea what your store is worth",
    description:
      "Most owners have no real-time valuation. They find out at closing — often leaving money on the table.",
  },
  {
    icon: "📋",
    title: "Lease risk nobody talks about",
    description:
      "A short lease can kill a sale or a refinance. Most owners don't realize it until it's too late.",
  },
  {
    icon: "⚙️",
    title: "Equipment is your biggest asset",
    description:
      "Old machines hurt your valuation multiple. Knowing when to retool is the difference between a 3x and a 5x multiple.",
  },
];

const features = [
  {
    icon: "💎",
    title: "Live Valuation Engine",
    description:
      "Know what your store is worth today. See exactly which factors are driving — or hurting — your valuation.",
  },
  {
    icon: "📋",
    title: "Lease Risk Management",
    description:
      "Track lease expiration, renewal options, and site control. Never get caught with a short lease at closing.",
  },
  {
    icon: "⚙️",
    title: "Equipment Scoring",
    description:
      "Grade your equipment fleet A through D. See the direct impact on your valuation multiple.",
  },
  {
    icon: "🛡️",
    title: "Insurance Management",
    description:
      "Track all policies, renewals, and coverage gaps in one place. Get alerts before anything expires.",
  },
  {
    icon: "🏦",
    title: "Lender-Ready Reports",
    description:
      "Generate professional underwriting reports in seconds. Built for SBA lenders, brokers, and buyers.",
  },
  {
    icon: "🏢",
    title: "Portfolio Dashboard",
    description:
      "Own multiple stores? Track your entire portfolio value, DSCR, and net worth in one view.",
  },
];

const audiences = [
  {
    icon: "🏪",
    title: "Store Owners",
    description:
      "Know your store's value. Maximize it before you sell or refinance. Track every metric that matters to lenders.",
  },
  {
    icon: "🤝",
    title: "Brokers & Advisors",
    description:
      "Run valuations in minutes. Generate lender-ready reports. Win more listings with professional analysis.",
  },
  {
    icon: "🏦",
    title: "Lenders & Underwriters",
    description:
      "Underwrite laundromat loans with confidence. See DSCR, lease risk, equipment scores, and valuations in one package.",
  },
  {
    icon: "🔑",
    title: "Buyers & Investors",
    description:
      "Analyze acquisitions before you buy. Model scenarios. Understand what drives value before you make an offer.",
  },
];

const trustBadges = ["🏪 Multi-Store Owner", "🤝 Business Broker", "🏦 SBA Lender", "📊 CPA / Accountant", "🔑 Buyer / Investor"];

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
      {/* SECTION 1 — Hero */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden pt-16"
        style={{ background: "#0a1628" }}
      >
        <div className="marketing-hero-grid absolute inset-0 opacity-30" />
        <div className="marketing-hero-particles absolute inset-0 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 w-full">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-8 hero-banner">
            <div className="w-full lg:w-[60%]">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 mb-8">
                🚀 Now in Beta — Free Access
              </div>

              <h1
                className="font-bold text-white tracking-tight leading-[1.08] mb-6"
                style={{ fontSize: "clamp(36px, 5vw, 60px)" }}
              >
                The Financial Operating System for Laundromats
              </h1>

              <p className="text-[18px] lg:text-[20px] text-slate-400 leading-relaxed mb-10 max-w-2xl">
                Track store value, underwrite acquisitions, manage leases, and grow your portfolio — all in one
                platform built specifically for laundromat owners, buyers, brokers, and lenders.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-[16px] font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
                >
                  Start Free Trial →
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-[16px] font-semibold border border-white/30 text-white hover:bg-white/10 transition-colors"
                >
                  See How It Works
                </a>
              </div>

              <p className="text-[13px] text-slate-500 mb-8">
                No credit card required · Free during beta · Cancel anytime
              </p>

              <div className="flex flex-wrap gap-4">
                {["🔒 Bank-grade security", "📊 Live valuations", "🏦 Lender-ready reports"].map((badge) => (
                  <span
                    key={badge}
                    className="text-[12px] text-slate-400 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-[40%] hide-mobile">
              <HeroIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — Social proof */}
      <section style={{ background: "#0f1e3d" }} className="py-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[14px] text-slate-400 mb-6">
            Trusted by laundromat owners, brokers, and lenders across the country
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {trustBadges.map((badge) => (
              <span
                key={badge}
                className="px-4 py-2 rounded-full text-[13px] font-medium text-slate-300 bg-white/5 border border-white/10"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — Problem/Solution */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[32px] lg:text-[40px] font-bold text-slate-900 text-center max-w-4xl mx-auto leading-tight mb-16">
            Laundromats are one of America&apos;s best small businesses. Managing them shouldn&apos;t feel like
            guesswork.
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((item) => (
              <div
                key={item.title}
                className="p-8 rounded-2xl bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <div className="text-[36px] mb-4">{item.icon}</div>
                <h3 className="text-[18px] font-bold text-slate-900 mb-3">{item.title}</h3>
                <p className="text-[15px] text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 — Features */}
      <section id="features" className="py-24" style={{ background: "#F8FAFC" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[32px] lg:text-[40px] font-bold text-slate-900 mb-4">
              Everything you need to run your laundromat like a CFO
            </h2>
            <p className="text-[18px] text-slate-500">
              Built specifically for laundromats. Not generic accounting software.
            </p>
          </div>
          <div
            className="gap-6"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}
          >
            {features.map((item) => (
              <div
                key={item.title}
                className="p-8 rounded-2xl bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <div className="text-[32px] mb-4">{item.icon}</div>
                <h3 className="text-[17px] font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5 — Who it's for */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[32px] lg:text-[40px] font-bold text-slate-900 text-center mb-16">
            Built for everyone in the laundromat industry
          </h2>
          <div
            className="gap-6"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "24px" }}
          >
            {audiences.map((item) => (
              <div
                key={item.title}
                className="p-7 rounded-2xl bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <div className="text-[28px] mb-3">{item.icon}</div>
                <h3 className="text-[16px] font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6 — Valuation preview */}
      <section className="py-24" style={{ background: "#0a1628" }}>
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-[32px] lg:text-[36px] font-bold text-white text-center mb-12">
            See exactly why your store is worth what it&apos;s worth
          </h2>
          <div
            className="rounded-2xl p-8 border"
            style={{ background: "#161f30", borderColor: "rgba(148,163,184,0.15)" }}
          >
            <div className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-6">
              Valuation Breakdown
            </div>
            <div className="space-y-3">
              {valuationLines.map((line) => (
                <div key={line.label} className="flex items-center justify-between text-[14px]">
                  <span className="text-slate-300">{line.label}</span>
                  <span
                    className={
                      line.type === "positive"
                        ? "font-semibold text-green-400"
                        : line.type === "negative"
                          ? "font-semibold text-red-400"
                          : "font-semibold text-slate-100"
                    }
                  >
                    {line.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 mt-6 pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-slate-200">= Final Multiple</span>
                <span className="text-[24px] font-bold text-blue-400">4.70x</span>
              </div>
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-slate-400">× EBITDA</span>
                <span className="font-semibold text-slate-100">$237,000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-slate-200">= Store Value</span>
                <span className="text-[28px] font-bold text-green-400">$1,113,900</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 — CTA */}
      <section className="py-24" style={{ background: "#0f1e3d" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[32px] lg:text-[40px] font-bold text-white mb-4">
            Start tracking your laundromat&apos;s value today.
          </h2>
          <p className="text-[18px] text-slate-400 mb-10">Free during beta. No credit card required.</p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-[17px] font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            Create Free Account →
          </Link>
          <p className="text-[14px] text-slate-500 mt-8">
            Join laundromat owners, brokers, and lenders already using LaundroCFO
          </p>
        </div>
      </section>
    </>
  );
}
