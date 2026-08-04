# Co-owner Stage 3 — App-layer query audit

Running list of client/server queries that filter on `user_id` (or `stores.user_id`) where co-owner access should use **store access** instead (owned stores ∪ `store_members`).

RLS is updated in Stages 2A–2C; these app filters still hide shared stores or rows from co-owners.

**Legend**
- **Fix** — should use store-access helper / query pattern in Stage 3
- **Owner-only** — keep as-is (not co-owner scope)
- **Stage 2D** — table RLS not updated yet; fix query after RLS migration

---

## P0 — Store discovery (blocks co-owners entirely)

| Location | Query | Notes |
|----------|-------|-------|
| `src/lib/store-context.tsx` | `stores` `.eq("user_id", user.id)` | **Fix** — central store picker; must load owned + member stores |

---

## P1 — Store listing / portfolio (owned stores only)

| Location | Query | Notes |
|----------|-------|-------|
| `src/lib/getPortfolioReport.ts` | `stores` `.eq("user_id", userId)` | **Fix** — portfolio report omits member stores |
| `src/lib/getStoreValuation.ts` | `stores` `.eq("user_id", userId)` | **Fix** — batch valuation for portfolio |
| `src/app/reports/page.tsx` | `stores` `.eq("user_id", userId)` | **Fix** — multi-store report store list |
| `src/app/api/cron/send-alert-digest/route.ts` | `stores` `.eq("user_id", userId)` | **Fix** — digest only covers owned stores; member stores’ alerts skipped |

---

## P1 — `store_alerts` (RLS fixed Stage 2C; app still filters by row `user_id`)

| Location | Function / context | Query | Notes |
|----------|-------------------|-------|-------|
| `src/lib/alerts.ts` | `fetchUnshownStoreAlerts` | `store_alerts` `.eq("user_id", params.userId)` | **Fix** — filter by accessible `store_id`(s), not row author |
| `src/lib/alerts.ts` | `fetchPortfolioStoreAlerts` | `store_alerts` `.eq("user_id", params.userId)` | **Fix** — same |
| `src/lib/email/alertDigest.ts` | digest fetch | `store_alerts` `.eq("user_id", params.userId)` | **Fix** — same |

---

## P2 — Redundant `user_id` on store-scoped tables (also filter `store_id`)

RLS allows co-owner access; redundant `user_id` excludes rows where `user_id` is the owner’s id.

| Location | Table | Query | Notes |
|----------|-------|-------|-------|
| `src/app/equipment/page.tsx` | `equipment_inventory` | `.eq("user_id", user.id)` + `.eq("store_id", …)` | **Fix** — drop `user_id` filter |
| `src/app/insurance/page.tsx` | `insurance_policies` | `.eq("user_id", user.id)` + `.eq("store_id", …)` | **Fix** — drop `user_id` filter |
| `src/app/scenarios/page.tsx` | `saved_scenarios` | `.eq("user_id", uid)` + `.eq("store_id", storeId)` | **Fix** — drop `user_id` filter |
| `src/components/debt/SavedLoanCalculationsSection.tsx` | `saved_loan_calculations` | `.eq("user_id", uid)` + `.eq("store_id", storeId)` | **Fix** — drop `user_id` filter |

---

## P2 — Settings / store admin UI (owned stores only)

| Location | Query | Notes |
|----------|-------|-------|
| `src/app/settings/manage-stores/page.tsx` | `stores` `.eq("user_id", user.id)` | **Owner-only?** — list/create/archive/delete stores; co-owners should not manage membership here, but may need read-only visibility elsewhere via `store-context` |
| `src/app/settings/edit-store/page.tsx` | `stores` `.eq("user_id", user.id)` | **Fix** — co-owners should edit store details (RLS allows UPDATE); drop owner-only filter or use store-access check |

---

## P2 — `verifyUserOwnsStore` (API gate: owner vs access)

Used by Plaid/QuickBooks API routes. Co-owners can edit financials but OAuth connections may stay **owner-only** by product decision.

| Location | Notes |
|----------|-------|
| `src/lib/plaid.ts` | `verifyUserOwnsStore` — `.eq("user_id", userId)` on `stores` |
| `src/lib/quickbooks.ts` | `verifyUserOwnsStore` — same |
| `src/app/api/plaid/create-link-token/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/plaid/exchange-token/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/plaid/sync-transactions/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/plaid/disconnect/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/plaid/complete-update-mode/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/quickbooks/authorize/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/quickbooks/callback/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/quickbooks/sync/route.ts` | calls `verifyUserOwnsStore` |
| `src/app/api/quickbooks/disconnect/route.ts` | calls `verifyUserOwnsStore` |

**Stage 3 decision:** rename to `verifyUserCanAccessStore` vs keep integrations owner-only.

---

## Stage 2D — Tables still on `auth.uid() = user_id` RLS

Fix app queries after Stage 2D RLS migration.

| Location | Table | Query |
|----------|-------|-------|
| `src/app/transactions/page.tsx` | `categorization_rules` | `.eq("user_id", user.id)` (×2) |
| `src/lib/plaid.ts` | `categorization_rules` | `.eq("user_id", userId)` (admin sync path) |

**Also Stage 2D (no redundant app filter today, but RLS still owner-only):**
- `insurance_claims` — loaded via `policy_id` in `src/app/insurance/page.tsx` (OK once RLS updated)
- `categorization_rules`, `plaid_connections`, `quickbooks_connections`, `insurance_claims` — see Stage 2D migration plan

---

## App bug (not a filter issue)

| Location | Issue | Notes |
|----------|-------|-------|
| `src/components/occupancy/LeaseModule.tsx` | `lease_options` insert/upsert includes `store_id` | Column does not exist — PostgREST **PGRST204** error; failures logged as non-blocking |

---

## Explicitly NOT Stage 3 (correctly user-scoped)

| Location | Table / purpose |
|----------|-----------------|
| `src/lib/access.ts` | `subscriptions` — caller’s plan |
| `src/lib/access.ts` | `stores` count — **owned** store limit for billing |
| `src/lib/onboarding.ts` | `stores` count — onboarding “has store” |
| `src/app/api/stores/route.ts` | `stores` — duplicate check on **create** (owner-only) |
| `src/app/onboarding/page.tsx` | `stores` — duplicate check on create |
| `src/app/api/stripe/create-checkout-session/route.ts` | `subscriptions` |
| `src/app/api/stripe/create-portal-session/route.ts` | `subscriptions` |
| `src/app/account/page.tsx` | `subscriptions` |
| `src/lib/account-deletion.ts` | user’s stores, plaid/qb connections on delete |

---

## Stage 3 implementation sketch

1. Add `src/lib/store-access.ts` (or extend `store-members.ts`):
   - `fetchAccessibleStores(supabase, userId)` — owned ∪ member
   - `userCanAccessStore(supabase, userId, storeId)` — RPC or client-side check
2. Replace `store-context` load query first (unblocks UI).
3. Remove redundant `user_id` filters where `store_id` + RLS suffice.
4. Update alert fetchers to filter by accessible store IDs.
5. Decide integration OAuth owner-only vs `user_can_access_store`.
