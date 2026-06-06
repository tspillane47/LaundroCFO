"use client";
import { store, financials } from "@/lib/data";

const storeFields = [
  ["Store Name", "Sunnyvale Super Wash"],
  ["Address", "445 W Olive Ave, Sunnyvale, CA 94086"],
  ["Square Footage", "4,450 SF"],
  ["Total Washers", "28"],
  ["Total Dryers", "32"],
  ["Total Machines", "60"],
  ["Year Opened", "2015"],
  ["Store Type", "Card / Hybrid"],
  ["WDF % of Revenue", "18%"],
  ["Commercial % of Revenue", "12%"],
];

const valuationFields = [
  ["Base EBITDA Multiple", "4.5x"],
  ["Valuation Method", "EBITDA × Multiple"],
  ["Min DSCR Threshold", "1.25x"],
  ["Utility Alert Threshold", "20%"],
  ["Occupancy Cost Alert", "20%"],
  ["Lease Risk Threshold", "5 years remaining"],
  ["Equipment Age Alert", "12 years avg"],
];

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-[15px] font-semibold text-slate-100">Settings</h1>

      <div className="grid grid-cols-2 gap-5">
        {/* Store Profile */}
        <div className="space-y-4">
          <div className="card">
            <div className="section-title">Store Profile</div>
            <div className="divide-y divide-white/[0.04]">
              {storeFields.map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 text-[13px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-100">{value}</span>
                </div>
              ))}
            </div>
            <button className="btn-outline w-full mt-4">Edit Store Profile</button>
          </div>

          {/* Notifications */}
          <div className="card">
            <div className="section-title">Notifications</div>
            <div className="divide-y divide-white/[0.04]">
              {[
                ["Email Alerts", true],
                ["Monthly Report", true],
                ["Lender Share", false],
                ["SMS Alerts", false],
              ].map(([label, on]) => (
                <div key={String(label)} className="flex justify-between py-2.5 text-[13px]">
                  <span className="text-slate-400">{label}</span>
                  <span className={on ? "text-green-400 font-semibold" : "text-slate-600"}>
                    {on ? "Enabled" : "Disabled"}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn-outline w-full mt-4">Manage Notifications</button>
          </div>
        </div>

        {/* Valuation + Account */}
        <div className="space-y-4">
          <div className="card">
            <div className="section-title">Valuation Settings</div>
            <div className="divide-y divide-white/[0.04]">
              {valuationFields.map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 text-[13px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-100">{value}</span>
                </div>
              ))}
            </div>
            <button className="btn-outline w-full mt-4">Edit Valuation Settings</button>
          </div>

          <div className="card">
            <div className="section-title">Account</div>
            <div className="divide-y divide-white/[0.04]">
              {[
                ["Name", "John Doe"],
                ["Email", "john@sunnyvale-wash.com"],
                ["Role", "Owner / Operator"],
                ["Plan", "Pro"],
                ["Stores", "1 of 3 allowed"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 text-[13px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-100">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-outline flex-1">Edit Profile</button>
              <button className="btn-outline flex-1 text-red-400 border-red-500/20">Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
