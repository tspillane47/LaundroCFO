"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";

const inputClass =
  "w-full bg-[var(--bg-input)] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-[#4a7c59] dark:focus:border-blue-500";

type StoreForm = {
  name: string;
  address: string;
  square_footage: string;
  store_type: string;
  year_opened: string;
  washers: string;
  dryers: string;
  market_density: string;
  store_condition: string;
  revenue_trend: string;
  competition_level: string;
  self_service_pct: string;
  wdf_pct: string;
  commercial_pct: string;
};

const MARKET_OPTIONS = [
  { value: "urban", label: "Dense Urban" },
  { value: "suburban", label: "Suburban" },
  { value: "average", label: "Small City" },
  { value: "rural", label: "Rural" },
];

const CONDITION_OPTIONS = ["excellent", "good", "fair", "poor"];
const TREND_OPTIONS = ["growing", "stable", "declining"];
const COMPETITION_OPTIONS = ["protected", "normal", "heavy"];
const STORE_TYPES = ["Coin", "Card", "Hybrid"];
const PREFERENCES_KEY = "laundrocfo_preferences";

type NotificationPrefs = {
  emailAlerts: boolean;
  monthlyReport: boolean;
  lenderShare: boolean;
  smsAlerts: boolean;
};

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  emailAlerts: true,
  monthlyReport: true,
  lenderShare: false,
  smsAlerts: false,
};

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { stores, selectedStore, refreshStores } = useStores();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingStore, setEditingStore] = useState(false);
  const [editingNotifications, setEditingNotifications] = useState(false);
  const [editingValuation, setEditingValuation] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [savingCash, setSavingCash] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    monthlyReport: true,
    lenderShare: false,
    smsAlerts: false,
  });

  const [valuationSettings, setValuationSettings] = useState({
    baseMultiple: "4.5",
    minDscr: "1.25",
    utilityThreshold: "20",
    occupancyThreshold: "20",
  });

  const [form, setForm] = useState<StoreForm>({
    name: "",
    address: "",
    square_footage: "",
    store_type: "Hybrid",
    year_opened: "",
    washers: "",
    dryers: "",
    market_density: "suburban",
    store_condition: "fair",
    revenue_trend: "stable",
    competition_level: "normal",
    self_service_pct: "70",
    wdf_pct: "18",
    commercial_pct: "12",
  });

  const [cashForm, setCashForm] = useState({
    operating_account_balance: "",
    reserve_account_balance: "",
    petty_cash: "",
  });

  function setField(field: keyof StoreForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email ?? "");
      setUserName(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User");

      try {
        const saved = localStorage.getItem(PREFERENCES_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<NotificationPrefs>;
          setNotifications({ ...DEFAULT_NOTIFICATIONS, ...parsed });
        }
      } catch {
        /* ignore invalid preferences */
      }

      if (selectedStore) {
        setForm({
          name: selectedStore.name ?? "",
          address: selectedStore.address ?? "",
          square_footage: selectedStore.square_footage != null ? String(selectedStore.square_footage) : "",
          store_type: selectedStore.store_type ?? "Hybrid",
          year_opened: selectedStore.year_opened != null ? String(selectedStore.year_opened) : "",
          washers: selectedStore.washers != null ? String(selectedStore.washers) : "",
          dryers: selectedStore.dryers != null ? String(selectedStore.dryers) : "",
          market_density: selectedStore.market_density ?? selectedStore.location_type ?? "suburban",
          store_condition: selectedStore.store_condition ?? "fair",
          revenue_trend: selectedStore.revenue_trend ?? "stable",
          competition_level: selectedStore.competition_level ?? "normal",
          self_service_pct: selectedStore.self_service_pct != null ? String(selectedStore.self_service_pct) : "70",
          wdf_pct: selectedStore.wdf_pct != null ? String(selectedStore.wdf_pct) : "18",
          commercial_pct: selectedStore.commercial_pct != null ? String(selectedStore.commercial_pct) : "12",
        });
        setCashForm({
          operating_account_balance:
            selectedStore.operating_account_balance != null
              ? String(selectedStore.operating_account_balance)
              : "",
          reserve_account_balance:
            selectedStore.reserve_account_balance != null
              ? String(selectedStore.reserve_account_balance)
              : "",
          petty_cash:
            selectedStore.petty_cash != null ? String(selectedStore.petty_cash) : "",
        });
      }
      setLoading(false);
    }
    load();
  }, [selectedStore?.id]);

  async function handleSaveStore() {
    if (!selectedStore?.id) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("stores")
      .update({
        name: form.name,
        address: form.address,
        square_footage: form.square_footage ? Number(form.square_footage) : null,
        store_type: form.store_type,
        year_opened: form.year_opened ? Number(form.year_opened) : null,
        washers: form.washers ? Number(form.washers) : null,
        dryers: form.dryers ? Number(form.dryers) : null,
        market_density: form.market_density,
        store_condition: form.store_condition,
        revenue_trend: form.revenue_trend,
        competition_level: form.competition_level,
        self_service_pct: form.self_service_pct ? Number(form.self_service_pct) : null,
        wdf_pct: form.wdf_pct ? Number(form.wdf_pct) : null,
        commercial_pct: form.commercial_pct ? Number(form.commercial_pct) : null,
      })
      .eq("id", selectedStore.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess("Store profile updated successfully.");
      setEditingStore(false);
      await refreshStores();
    }
    setSaving(false);
  }

  async function handleSaveCash() {
    if (!selectedStore?.id) return;
    setSavingCash(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("stores")
      .update({
        operating_account_balance: cashForm.operating_account_balance
          ? Number(cashForm.operating_account_balance)
          : 0,
        reserve_account_balance: cashForm.reserve_account_balance
          ? Number(cashForm.reserve_account_balance)
          : 0,
        petty_cash: cashForm.petty_cash ? Number(cashForm.petty_cash) : 0,
        cash_last_updated: new Date().toISOString(),
        cash_source: "manual",
      })
      .eq("id", selectedStore.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess("Cash balances updated successfully.");
      setEditingCash(false);
      await refreshStores();
    }
    setSavingCash(false);
  }

  function handleSaveNotifications() {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(notifications));
    setEditingNotifications(false);
    setSuccess("Notification preferences saved.");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return <LoadingSkeleton rows={6} />;
  }

  if (!selectedStore) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-400 text-[14px]">Select a store from the dropdown above to manage settings.</p>
      </div>
    );
  }

  const totalMachines =
    (Number(form.washers) || 0) + (Number(form.dryers) || 0);

  return (
    <div className="space-y-5">
      <h1 className="text-[15px] font-semibold text-slate-100">Settings</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">{error}</div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">{success}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          {/* Store Profile */}
          <div className="card">
            <div className="section-title">Store Profile</div>

            {editingStore ? (
              <div className="space-y-3">
                <div>
                  <div className="metric-label mb-1.5">Store Name</div>
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Address</div>
                  <input value={form.address} onChange={(e) => setField("address", e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="metric-label mb-1.5">Square Footage</div>
                    <input type="number" value={form.square_footage} onChange={(e) => setField("square_footage", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Store Type</div>
                    <select value={form.store_type} onChange={(e) => setField("store_type", e.target.value)} className={inputClass}>
                      {STORE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Year Opened</div>
                    <input type="number" value={form.year_opened} onChange={(e) => setField("year_opened", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Market Density</div>
                    <select value={form.market_density} onChange={(e) => setField("market_density", e.target.value)} className={inputClass}>
                      {MARKET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Washers</div>
                    <input type="number" value={form.washers} onChange={(e) => setField("washers", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Dryers</div>
                    <input type="number" value={form.dryers} onChange={(e) => setField("dryers", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Store Condition</div>
                    <select value={form.store_condition} onChange={(e) => setField("store_condition", e.target.value)} className={inputClass}>
                      {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Revenue Trend</div>
                    <select value={form.revenue_trend} onChange={(e) => setField("revenue_trend", e.target.value)} className={inputClass}>
                      {TREND_OPTIONS.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Competition Level</div>
                    <select value={form.competition_level} onChange={(e) => setField("competition_level", e.target.value)} className={inputClass}>
                      {COMPETITION_OPTIONS.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="metric-label mb-1.5">Self-Service %</div>
                    <input type="number" value={form.self_service_pct} onChange={(e) => setField("self_service_pct", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">WDF %</div>
                    <input type="number" value={form.wdf_pct} onChange={(e) => setField("wdf_pct", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className="metric-label mb-1.5">Commercial %</div>
                    <input type="number" value={form.commercial_pct} onChange={(e) => setField("commercial_pct", e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveStore} disabled={saving} className="btn-primary flex-1">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button onClick={() => setEditingStore(false)} className="btn-outline flex-1">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    ["Store Name", form.name || "—"],
                    ["Address", form.address || "—"],
                    ["Square Footage", form.square_footage ? `${Number(form.square_footage).toLocaleString()} SF` : "—"],
                    ["Total Washers", form.washers || "—"],
                    ["Total Dryers", form.dryers || "—"],
                    ["Total Machines", totalMachines > 0 ? String(totalMachines) : "—"],
                    ["Year Opened", form.year_opened || "—"],
                    ["Store Type", form.store_type || "—"],
                    ["Market Density", MARKET_OPTIONS.find((o) => o.value === form.market_density)?.label ?? form.market_density],
                    ["Store Condition", labelize(form.store_condition)],
                    ["Revenue Trend", labelize(form.revenue_trend)],
                    ["Competition", labelize(form.competition_level)],
                    ["Self-Service %", form.self_service_pct ? `${form.self_service_pct}%` : "—"],
                    ["WDF %", form.wdf_pct ? `${form.wdf_pct}%` : "—"],
                    ["Commercial %", form.commercial_pct ? `${form.commercial_pct}%` : "—"],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between py-2.5 text-[13px]">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-slate-100">{value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditingStore(true)} className="btn-outline w-full mt-4">
                  Edit Store Profile
                </button>
                <Link
                  href="/settings/manage-stores"
                  className="btn-primary w-full mt-3 text-center block text-[13px] py-2.5"
                >
                  Manage Stores / Remove Duplicates →
                </Link>
              </>
            )}
          </div>

          {/* Cash & Bank Accounts */}
          <div className="card">
            <div className="section-title">Cash & Bank Accounts</div>
            {editingCash ? (
              <div className="space-y-3">
                <div>
                  <div className="metric-label mb-1.5">Operating Account Balance</div>
                  <input
                    type="number"
                    value={cashForm.operating_account_balance}
                    onChange={(e) =>
                      setCashForm((c) => ({ ...c, operating_account_balance: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Reserve Account Balance</div>
                  <input
                    type="number"
                    value={cashForm.reserve_account_balance}
                    onChange={(e) =>
                      setCashForm((c) => ({ ...c, reserve_account_balance: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <div className="metric-label mb-1.5">Petty Cash</div>
                  <input
                    type="number"
                    value={cashForm.petty_cash}
                    onChange={(e) => setCashForm((c) => ({ ...c, petty_cash: e.target.value }))}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Connect QuickBooks or Plaid to sync automatically (coming soon)
                </p>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveCash} disabled={savingCash} className="btn-primary flex-1">
                    {savingCash ? "Saving..." : "Save Cash Balances"}
                  </button>
                  <button onClick={() => setEditingCash(false)} className="btn-outline flex-1">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    [
                      "Operating Account",
                      cashForm.operating_account_balance
                        ? `$${Number(cashForm.operating_account_balance).toLocaleString()}`
                        : "$0",
                    ],
                    [
                      "Reserve Account",
                      cashForm.reserve_account_balance
                        ? `$${Number(cashForm.reserve_account_balance).toLocaleString()}`
                        : "$0",
                    ],
                    [
                      "Petty Cash",
                      cashForm.petty_cash
                        ? `$${Number(cashForm.petty_cash).toLocaleString()}`
                        : "$0",
                    ],
                    [
                      "Total Cash",
                      `$${(
                        (Number(cashForm.operating_account_balance) || 0) +
                        (Number(cashForm.reserve_account_balance) || 0) +
                        (Number(cashForm.petty_cash) || 0)
                      ).toLocaleString()}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between py-2.5 text-[13px]">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-slate-100">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
                  Connect QuickBooks or Plaid to sync automatically (coming soon)
                </p>
                <button onClick={() => setEditingCash(true)} className="btn-outline w-full mt-4">
                  Update Cash Balances
                </button>
              </>
            )}
          </div>

          {/* Notifications */}
          <div className="card">
            <div className="section-title">Notifications</div>
            {editingNotifications ? (
              <div className="space-y-3">
                {([
                  ["emailAlerts", "Email Alerts"],
                  ["monthlyReport", "Monthly Report"],
                  ["lenderShare", "Lender Share"],
                  ["smsAlerts", "SMS Alerts"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between py-2 text-[13px] cursor-pointer">
                    <span className="text-slate-400">{label}</span>
                    <input
                      type="checkbox"
                      checked={notifications[key]}
                      onChange={(e) => setNotifications((n) => ({ ...n, [key]: e.target.checked }))}
                      className="rounded border-white/20 bg-[#1E3A1E] dark:bg-[#1e2a3a]"
                    />
                  </label>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveNotifications} className="btn-primary flex-1">Save</button>
                  <button
                    onClick={() => {
                      try {
                        const saved = localStorage.getItem(PREFERENCES_KEY);
                        if (saved) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...JSON.parse(saved) });
                      } catch {
                        setNotifications(DEFAULT_NOTIFICATIONS);
                      }
                      setEditingNotifications(false);
                    }}
                    className="btn-outline flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {([
                    ["Email Alerts", notifications.emailAlerts],
                    ["Monthly Report", notifications.monthlyReport],
                    ["Lender Share", notifications.lenderShare],
                    ["SMS Alerts", notifications.smsAlerts],
                  ] as const).map(([label, on]) => (
                    <div key={label} className="flex justify-between py-2.5 text-[13px]">
                      <span className="text-slate-400">{label}</span>
                      <span className={on ? "text-green-400 font-semibold" : "text-slate-600"}>
                        {on ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditingNotifications(true)} className="btn-outline w-full mt-4">
                  Manage Notifications
                </button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Valuation Settings */}
          <div className="card">
            <div className="section-title">Valuation Settings</div>
            {editingValuation ? (
              <div className="space-y-3">
                {([
                  ["baseMultiple", "Base EBITDA Multiple"],
                  ["minDscr", "Min DSCR Threshold"],
                  ["utilityThreshold", "Utility Alert Threshold (%)"],
                  ["occupancyThreshold", "Occupancy Cost Alert (%)"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <div className="metric-label mb-1.5">{label}</div>
                    <input
                      value={valuationSettings[key]}
                      onChange={(e) => setValuationSettings((v) => ({ ...v, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditingValuation(false)} className="btn-primary flex-1">Save</button>
                  <button onClick={() => setEditingValuation(false)} className="btn-outline flex-1">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    ["Base EBITDA Multiple", `${valuationSettings.baseMultiple}x`],
                    ["Valuation Method", "EBITDA × Multiple"],
                    ["Min DSCR Threshold", `${valuationSettings.minDscr}x`],
                    ["Utility Alert Threshold", `${valuationSettings.utilityThreshold}%`],
                    ["Occupancy Cost Alert", `${valuationSettings.occupancyThreshold}%`],
                    ["Lease Risk Threshold", "5 years remaining"],
                    ["Equipment Age Alert", "12 years avg"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2.5 text-[13px]">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-slate-100">{value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setEditingValuation(true)} className="btn-outline w-full mt-4">
                  Edit Valuation Settings
                </button>
              </>
            )}
          </div>

          {/* Account */}
          <div className="card">
            <div className="section-title">Account</div>
            <div className="divide-y divide-white/[0.04]">
              {[
                ["Name", userName],
                ["Email", userEmail],
                ["Plan", "Beta"],
                ["Stores", String(stores.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 text-[13px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-100">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditingStore(true)}
                className="btn-outline flex-1"
              >
                Edit Profile
              </button>
              <button onClick={handleSignOut} className="btn-outline flex-1 text-red-400 border-red-500/20">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
