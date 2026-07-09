import { TermsBackLink } from "@/components/ui/TermsBackLink";
import Link from "next/link";

const sections = [
  {
    id: "introduction",
    title: "Introduction",
    content: (
      <>
        <p>
          LaundroCFO (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) provides financial management
          software for laundromat owners, buyers, brokers, and lenders. This Privacy Policy explains what
          information we collect, how we use it, who we share it with, and the choices you have.
        </p>
        <p className="mt-3">
          By creating an account or using LaundroCFO, you agree to this policy. If you do not agree, please
          do not use the service.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: (
      <>
        <p>We collect information in three main ways: what you provide, what comes from connected services, and what is collected automatically.</p>
        <p className="mt-3 font-medium text-slate-200">Account and profile information</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Name, email address, and password</li>
          <li>Optional profile details such as phone number, company name, and role</li>
          <li>Account preferences and notification settings</li>
        </ul>
        <p className="mt-3 font-medium text-slate-200">Business and financial data you enter</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Store details, locations, and operational information</li>
          <li>Revenue, expenses, debt, lease, equipment, insurance, and other financial records you input</li>
          <li>Reports, valuations, scenarios, and other outputs generated from your data</li>
          <li>Feedback and support messages you send us</li>
        </ul>
        <p className="mt-3 font-medium text-slate-200">Bank and transaction data (via Plaid)</p>
        <p className="mt-2">
          When you choose to connect a bank account, we receive transaction and account information through
          Plaid, our bank connectivity partner. This may include account names, balances, and transaction
          history. We do not receive or store your online banking username or password — those are handled
          directly by Plaid.
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Bank connections via Plaid are planned and will be available in a future release. This section
          describes how that integration will work once it is live.
        </p>
        <p className="mt-3 font-medium text-slate-200">Payment and billing data (via Stripe)</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Subscription status, plan, and billing history</li>
          <li>Stripe customer identifiers linked to your account</li>
          <li>Payment method details (such as card type and last four digits) as provided by Stripe</li>
        </ul>
        <p className="mt-2">
          We do not store full credit card numbers. Payment card data is processed and stored by Stripe.
        </p>
        <p className="mt-3 font-medium text-slate-200">Automatically collected information</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Log data such as IP address, browser type, device information, and pages visited</li>
          <li>Session and authentication cookies needed to keep you signed in</li>
          <li>Usage analytics via Google Analytics (see Cookies and Tracking below)</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How We Use Your Information",
    content: (
      <ul className="list-disc pl-5 space-y-2">
        <li>Provide, operate, and maintain the LaundroCFO platform</li>
        <li>Authenticate your account and manage your subscription</li>
        <li>Store and process the financial data you enter to generate reports, valuations, KPIs, alerts, and other insights</li>
        <li>Import and categorize bank transactions when you connect accounts via Plaid</li>
        <li>Process payments and manage billing through Stripe</li>
        <li>Send service-related emails such as account verification, password resets, and subscription notices</li>
        <li>Send optional notifications you have enabled (such as weekly summaries or alert emails)</li>
        <li>Respond to support requests and improve the product based on feedback</li>
        <li>Monitor usage trends and fix technical issues</li>
        <li>Comply with legal obligations and enforce our Terms of Service</li>
      </ul>
    ),
  },
  {
    id: "how-we-share-information",
    title: "How We Share Your Information",
    content: (
      <>
        <p>
          We do not sell your personal information. We share data only with service providers that help us
          run LaundroCFO, when required by law, or with your direction.
        </p>
        <p className="mt-3 font-medium text-slate-200">Service providers we use</p>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>
            <strong className="text-slate-200">Supabase</strong> — hosts our database, handles user
            authentication, and stores application data. Your account and business data reside in Supabase
            infrastructure.
          </li>
          <li>
            <strong className="text-slate-200">Stripe</strong> — processes subscription payments, manages
            billing, and stores payment method information. Stripe receives the data needed to charge your
            account and maintain your subscription.
          </li>
          <li>
            <strong className="text-slate-200">Plaid</strong> — facilitates secure bank account connections
            and provides transaction data when you link a financial institution. Plaid receives credentials
            and account access information directly from you during the connection flow.
          </li>
          <li>
            <strong className="text-slate-200">Google Analytics</strong> — collects anonymized usage data to
            help us understand how the site and app are used.
          </li>
        </ul>
        <p className="mt-3 font-medium text-slate-200">Other disclosures</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>When required by law, regulation, legal process, or governmental request</li>
          <li>To protect the rights, safety, and security of LaundroCFO, our users, or the public</li>
          <li>In connection with a merger, acquisition, or sale of assets, with notice to you where required</li>
        </ul>
      </>
    ),
  },
  {
    id: "data-security",
    title: "Data Security",
    content: (
      <>
        <p>
          We take the security of your financial and personal data seriously. Measures include:
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-1">
          <li>Encryption in transit — all connections to LaundroCFO use HTTPS/TLS</li>
          <li>Encryption at rest — data stored in Supabase is encrypted at rest by our infrastructure provider</li>
          <li>Access controls — production data access is limited to authorized personnel who need it to operate the service</li>
          <li>Authentication — accounts are protected by secure password-based sign-in managed through Supabase Auth</li>
          <li>Third-party security — Stripe and Plaid maintain their own industry-standard security programs for payment and banking data</li>
        </ul>
        <p className="mt-3">
          No method of transmission or storage is completely secure. While we work to protect your data, we
          cannot guarantee absolute security.
        </p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: (
      <>
        <p>
          We retain your data for as long as your account is active and as needed to provide the service.
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-1">
          <li>
            <strong className="text-slate-200">Account and business data</strong> — kept while your account
            is open. If you request deletion, we will delete or anonymize this data within a reasonable
            period, except where we must retain it for legal or legitimate business purposes.
          </li>
          <li>
            <strong className="text-slate-200">Bank transaction data</strong> — retained while your account is
            active and any bank connection remains linked. Disconnecting a bank account stops new data from
            flowing in; previously imported transactions may remain unless you request deletion.
          </li>
          <li>
            <strong className="text-slate-200">Billing records</strong> — Stripe may retain payment and
            invoice records as required for tax, accounting, and compliance purposes, even after account
            cancellation.
          </li>
          <li>
            <strong className="text-slate-200">Log and analytics data</strong> — retained for a limited period
            for security monitoring and product improvement, then deleted or aggregated.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your Rights and Choices",
    content: (
      <>
        <p>Depending on where you live, you may have rights regarding your personal information. We will honor applicable requests to:</p>
        <ul className="mt-3 list-disc pl-5 space-y-1">
          <li><strong className="text-slate-200">Access</strong> — request a copy of the personal data we hold about you</li>
          <li><strong className="text-slate-200">Correct</strong> — update inaccurate account or profile information in your account settings, or ask us to correct other data</li>
          <li><strong className="text-slate-200">Delete</strong> — request deletion of your account and associated data</li>
          <li><strong className="text-slate-200">Export</strong> — request an export of your data (available from your account settings)</li>
          <li><strong className="text-slate-200">Disconnect</strong> — revoke bank connections through Plaid at any time once that feature is available</li>
          <li><strong className="text-slate-200">Opt out of marketing</strong> — adjust notification preferences in your account settings</li>
        </ul>
        <p className="mt-3">
          To exercise these rights, contact us at{" "}
          <a href="mailto:support@laundrocfo.com" className="text-blue-400 hover:text-blue-300">
            support@laundrocfo.com
          </a>
          . We may need to verify your identity before fulfilling a request. We will respond within a
          reasonable timeframe as required by applicable law.
        </p>
      </>
    ),
  },
  {
    id: "cookies-and-tracking",
    title: "Cookies and Tracking",
    content: (
      <>
        <p>LaundroCFO uses cookies and similar technologies for essential and analytics purposes.</p>
        <p className="mt-3 font-medium text-slate-200">Essential cookies</p>
        <p className="mt-2">
          We use session cookies to keep you signed in and maintain your authentication state. These are
          necessary for the service to function and are not used for advertising.
        </p>
        <p className="mt-3 font-medium text-slate-200">Analytics</p>
        <p className="mt-2">
          We use Google Analytics to understand how visitors and users interact with our website and
          application. Google Analytics may set cookies and collect information such as pages visited,
          time on site, and general device and browser characteristics. You can learn more about Google&apos;s
          practices at{" "}
          <a
            href="https://policies.google.com/privacy"
            className="text-blue-400 hover:text-blue-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google&apos;s Privacy Policy
          </a>
          . You may opt out of Google Analytics by installing the{" "}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            className="text-blue-400 hover:text-blue-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Analytics Opt-out Browser Add-on
          </a>
          .
        </p>
        <p className="mt-3">
          We do not use cookies for third-party advertising or cross-site tracking beyond what Google
          Analytics provides.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children's Privacy",
    content: (
      <p>
        LaundroCFO is a business tool not intended for individuals under 18. We do not knowingly collect
        personal information from children. If you believe a child has provided us data, contact us and we
        will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: (
      <p>
        We may update this Privacy Policy from time to time. When we make material changes, we will update
        the &ldquo;Last updated&rdquo; date at the top of this page and, where appropriate, notify you by
        email or through the application. Continued use of LaundroCFO after changes take effect means you
        accept the updated policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact Us",
    content: (
      <p>
        For privacy questions, data requests, or concerns about how we handle your information, contact us
        at{" "}
        <a href="mailto:support@laundrocfo.com" className="text-blue-400 hover:text-blue-300">
          support@laundrocfo.com
        </a>
        . For general terms governing use of the platform, see our{" "}
        <Link href="/terms" className="text-blue-400 hover:text-blue-300">
          Terms of Service
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <TermsBackLink />
          <h1 className="text-[28px] font-bold text-slate-100 mb-2">Privacy Policy</h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Last updated: July 8, 2026
          </p>
        </div>

        <div className="card space-y-8">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-amber-200">Important:</strong> This policy is provided for transparency
            and to support integrations such as Plaid and Stripe. It is not legal advice. Have a qualified
            attorney review this document before treating it as final or binding, especially given that
            LaundroCFO handles financial and business data.
          </div>

          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-[16px] font-semibold text-slate-100 mb-3">{section.title}</h2>
              <div className="text-[14px] text-[var(--text-secondary)] leading-relaxed">{section.content}</div>
            </section>
          ))}
        </div>

        <p className="text-center text-[12px] text-[var(--text-muted)] mt-8">
          Questions? Contact{" "}
          <a href="mailto:support@laundrocfo.com" className="text-blue-400 hover:text-blue-300">
            support@laundrocfo.com
          </a>
        </p>
      </div>
    </div>
  );
}
