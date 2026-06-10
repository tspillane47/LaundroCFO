import Link from "next/link";

const tiers = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    for: "Single store owners",
    highlighted: false,
    features: [
      "1 store",
      "Live valuation engine",
      "Lease management",
      "Equipment tracking",
      "Insurance tracking",
      "Store intelligence feed",
      "Basic reports",
    ],
    cta: "Start Free Trial",
    ctaHref: "/signup",
    ctaStyle: "outline" as const,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/mo",
    for: "Active operators and brokers",
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Up to 5 stores",
      "Everything in Starter",
      "Portfolio dashboard",
      "Lender-ready PDF reports",
      "Scenario planner",
      "Benchmarking",
      "Priority support",
    ],
    cta: "Start Free Trial",
    ctaHref: "/signup",
    ctaStyle: "primary" as const,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    for: "Lenders, brokers, large portfolios",
    highlighted: false,
    features: [
      "Unlimited stores",
      "Everything in Pro",
      "API access",
      "White-label reports",
      "QuickBooks integration",
      "Dedicated support",
      "Custom onboarding",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:hello@laundrocfo.com",
    ctaStyle: "outline" as const,
  },
];

const faqs = [
  {
    q: "Is it really free right now?",
    a: "Yes. LaundroCFO is free during our beta period. We're onboarding early users to improve the product before launching paid plans.",
  },
  {
    q: "What is a laundromat valuation multiple?",
    a: "A valuation multiple is applied to your store's EBITDA to estimate its market value. Laundromats typically sell for 2.5x to 6.0x EBITDA depending on lease terms, equipment age, location, and revenue trends.",
  },
  {
    q: "Can I use this for a store I'm buying?",
    a: "Absolutely. LaundroCFO is built for buyers, sellers, brokers, and lenders. You can analyze any store's financials and generate a lender-ready underwriting report.",
  },
  {
    q: "Do I need accounting software?",
    a: "No. You enter your store's key financials directly into LaundroCFO. QuickBooks integration is coming soon for automatic syncing.",
  },
];

export default function PricingPage() {
  return (
    <div className="pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="text-[40px] lg:text-[48px] font-bold text-slate-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-[18px] text-slate-500">Free during beta. Paid plans launching soon.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? "bg-white border-2 border-[#2563eb] shadow-xl shadow-blue-500/10 scale-[1.02]"
                  : "bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              }`}
            >
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[12px] font-semibold bg-[#2563eb] text-white">
                  {tier.badge}
                </div>
              )}
              <div className="mb-6">
                <h2 className="text-[20px] font-bold text-slate-900 mb-1">{tier.name}</h2>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-[40px] font-extrabold text-slate-900 tracking-tight">{tier.price}</span>
                  {tier.period && <span className="text-[16px] text-slate-500">{tier.period}</span>}
                </div>
                <p className="text-[14px] text-slate-500">{tier.for}</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[14px] text-slate-600">
                    <span className="text-[#2563eb] mt-0.5 flex-shrink-0">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              {tier.ctaHref.startsWith("mailto") ? (
                <a
                  href={tier.ctaHref}
                  className={`w-full text-center py-3 rounded-xl text-[14px] font-semibold transition-colors ${
                    tier.ctaStyle === "primary"
                      ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tier.cta}
                </a>
              ) : (
                <Link
                  href={tier.ctaHref}
                  className={`w-full text-center py-3 rounded-xl text-[14px] font-semibold transition-colors ${
                    tier.ctaStyle === "primary"
                      ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tier.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-[14px] text-slate-500 mb-20">
          🔒 All plans free during beta period. Early users lock in founding member pricing.
        </p>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-[28px] font-bold text-slate-900 text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="p-6 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-[16px] font-bold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
