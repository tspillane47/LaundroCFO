# LaundroCFO — MVP

A live valuation and underwriting platform for laundromats. Built with Next.js 14, Tailwind CSS, and Recharts.

## Quick Start

```bash
cd laundrocfo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with sidebar + topbar
│   ├── page.tsx            # Redirects to /dashboard
│   ├── globals.css         # Global styles + Tailwind
│   ├── dashboard/page.tsx  # Main dashboard
│   ├── financials/page.tsx # Financial metrics & charts
│   ├── lease/page.tsx      # Lease analysis & scoring
│   ├── equipment/page.tsx  # Equipment inventory & scoring
│   ├── scenarios/page.tsx  # Scenario planner (8 scenarios)
│   ├── benchmarking/page.tsx # Industry benchmarks
│   ├── reports/page.tsx    # Lender report preview
│   ├── alerts/page.tsx     # Active alerts
│   ├── integrations/page.tsx # QuickBooks/Plaid/upload UI
│   └── settings/page.tsx   # Store profile & settings
├── components/
│   └── ui/
│       ├── MetricCard.tsx  # Reusable KPI card
│       └── ScoreRing.tsx   # SVG score ring
└── lib/
    ├── data.ts             # All mock seed data
    └── calculations.ts     # Formula utilities
```

## Key Formulas (src/lib/calculations.ts)

- `calcDSCR(cashFlow, annualDebtService)` → Cash Flow / Annual Debt Service
- `calcEbitdaMargin(ebitda, revenue)` → EBITDA / Revenue × 100
- `calcRentToRevenue(annualRent, revenue)` → Annual Rent / Revenue × 100
- `calcUtilityRatio(utilities, revenue)` → Utilities / Revenue × 100
- `calcRevenuePerSF(revenue, sqft)` → Revenue / Square Footage
- `calcValuationMultiple(params)` → Base 4.5x with dynamic adjustments
- `calcLeaseScore(params)` → 0–100 score based on term, options, clauses
- `calcEquipmentScore(avgAge)` → 0–100 score based on average age

## Changing the Seed Store

Edit `src/lib/data.ts` to update financials, equipment, lease terms, or any store profile data. All pages read from this file.

## Connecting Real Data (Supabase)

Replace the imports in each page from `@/lib/data` with Supabase queries. The data shapes are already typed and ready to swap.

## Tech Stack

- **Next.js 14** — App Router
- **TypeScript** — Full type safety
- **Tailwind CSS** — Utility-first styling
- **Recharts** — Revenue and EBITDA charts
- **DM Sans** — Google Fonts via CSS import
