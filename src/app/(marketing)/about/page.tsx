import Link from "next/link";

const beliefs = [
  {
    title: "Valuation transparency",
    description:
      "Every owner deserves to know what their store is worth — and why — at any moment. Not just at closing.",
  },
  {
    title: "Lease risk is underestimated",
    description:
      "More laundromat deals fall apart because of lease issues than almost any other reason. We make lease risk visible.",
  },
  {
    title: "Equipment drives value",
    description:
      "The age and quality of your equipment directly affects your valuation multiple. We make that relationship explicit.",
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

export default function AboutPage() {
  return (
    <div>
      <section className="pt-32 pb-20" style={{ background: "#0a1628" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-[36px] lg:text-[48px] font-bold text-white tracking-tight leading-tight mb-6">
            Built by people who understand laundromats and finance.
          </h1>
          <p className="text-[18px] lg:text-[20px] text-gray-700 dark:text-slate-400 leading-relaxed">
            LaundroCFO was created because laundromat owners deserve the same financial tools that large businesses
            take for granted.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-[32px] font-bold text-slate-900 mb-6">Our Mission</h2>
          <p className="text-[16px] text-gray-700 leading-relaxed">
            Laundromats are one of America&apos;s most resilient small businesses — recession-resistant, cash-flowing,
            and community-essential. But most owners manage them with spreadsheets, gut instinct, and outdated
            financial tools. LaundroCFO changes that. We built a platform that gives every laundromat owner, buyer,
            broker, and lender the financial intelligence they need to make better decisions, maximize value, and grow
            with confidence.
          </p>
        </div>
      </section>

      <section className="py-24" style={{ background: "#F8FAFC" }}>
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[32px] font-bold text-slate-900 text-center mb-16">What we believe</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {beliefs.map((item) => (
              <div
                key={item.title}
                className="p-8 rounded-2xl bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-[18px] font-bold text-slate-900 mb-3">{item.title}</h3>
                <p className="text-[15px] text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-[32px] font-bold text-slate-900 text-center mb-16">Who uses LaundroCFO</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {audiences.map((item) => (
              <div
                key={item.title}
                className="p-7 rounded-2xl bg-white border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-[16px] font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24" style={{ background: "#0f1e3d" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[32px] font-bold text-white mb-8">Ready to see what your store is worth?</h2>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-[16px] font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </section>
    </div>
  );
}
