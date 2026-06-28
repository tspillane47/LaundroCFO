import Link from "next/link";
import { Disclaimer } from "@/components/ui/Disclaimer";

const sections = [
  {
    id: "financial-disclaimer",
    title: "Financial Disclaimer",
    content: (
      <>
        <p>
          LaundroCFO is a software platform for informational and business management purposes only. All
          calculations, valuations, reports, projections, KPIs, and analytics are estimates based on
          user-provided information and proprietary calculations and should not be relied upon as
          professional advice.
        </p>
        <p className="mt-3">
          Nothing on LaundroCFO constitutes an appraisal, lending commitment, investment recommendation,
          or guarantee of business performance or asset value.
        </p>
      </>
    ),
  },
  {
    id: "no-advice",
    title: "No Financial, Investment, Legal, Tax, Accounting, or Lending Advice",
    content: (
      <p>
        LaundroCFO does not provide financial, investment, legal, tax, accounting, or lending advice.
        You should consult qualified professionals before making business, financial, legal, tax, or
        lending decisions. Your use of the platform does not create a professional relationship of any
        kind between you and LaundroCFO.
      </p>
    ),
  },
  {
    id: "estimates",
    title: "Estimates and Valuations Only",
    content: (
      <p>
        Store valuations, EBITDA multiples, DSCR figures, LaundroCFO Scores, scenario outputs, and
        other metrics displayed in the platform are modeling estimates — not certified appraisals,
        audited financial statements, or binding offers. Valuation methodologies may differ from those
        used by brokers, lenders, appraisers, or buyers in actual transactions.
      </p>
    ),
  },
  {
    id: "data-accuracy",
    title: "User Responsibility for Data Accuracy",
    content: (
      <p>
        All outputs depend on the accuracy and completeness of data you enter. You are solely
        responsible for verifying financial records, lease terms, equipment details, debt schedules,
        insurance coverage, and other inputs. LaundroCFO is not responsible for errors resulting from
        incomplete, outdated, or incorrect user data.
      </p>
    ),
  },
  {
    id: "no-guarantee",
    title: "No Guarantee of Accuracy or Results",
    content: (
      <p>
        We do not guarantee that any calculation, report, alert, or projection will be accurate,
        complete, current, or suitable for your purposes. Market conditions, lender requirements, and
        transaction-specific factors may materially affect actual outcomes.
      </p>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    content: (
      <p>
        To the fullest extent permitted by law, LaundroCFO and its affiliates, officers, employees,
        and agents shall not be liable for any indirect, incidental, special, consequential, or punitive
        damages, or any loss of profits, revenue, data, or business opportunities arising from your use
        of the platform — including decisions made based on valuations, reports, or analytics generated
        by the service.
      </p>
    ),
  },
  {
    id: "disclaimer-of-warranties",
    title: "Disclaimer of Warranties",
    content: (
      <p>
        The platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
        of any kind, whether express or implied, including warranties of merchantability, fitness for a
        particular purpose, accuracy, or non-infringement.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: (
      <p>
        You agree not to misuse the platform, attempt unauthorized access, interfere with service
        operation, scrape or reverse-engineer proprietary models, or use LaundroCFO for unlawful
        purposes. You may not represent platform outputs as professional advice or certified
        appraisals without independent verification.
      </p>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: (
      <p>
        LaundroCFO, its logos, software, valuation models, report templates, and content are owned by
        LaundroCFO or its licensors. You receive a limited, non-transferable license to use the
        platform for your internal business purposes. You retain ownership of data you submit.
      </p>
    ),
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    content: (
      <p>
        Your use of LaundroCFO is also governed by our Privacy Policy, which describes how we collect,
        use, and protect personal and business information. Contact us for privacy-related requests or
        questions about data handling practices.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing Law",
    content: (
      <p>
        These Terms are governed by the laws of [State], without regard to conflict-of-law principles.
        Disputes shall be resolved in the courts of [State], unless otherwise required by applicable
        law.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0d1520]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/login"
            className="text-[13px] text-slate-500 hover:text-slate-300 mb-6 inline-block"
          >
            ← Back
          </Link>
          <h1 className="text-[28px] font-bold text-slate-100 mb-2">Terms of Service</h1>
          <p className="text-[14px] text-slate-400">
            Last updated: June 28, 2026
          </p>
        </div>

        <div className="card space-y-8">
          <Disclaimer variant="full" />

          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-[16px] font-semibold text-slate-100 mb-3">{section.title}</h2>
              <div className="text-[14px] text-slate-400 leading-relaxed">{section.content}</div>
            </section>
          ))}
        </div>

        <p className="text-center text-[12px] text-slate-600 mt-8">
          Questions? Contact support@laundrocfo.com
        </p>
      </div>
    </div>
  );
}
